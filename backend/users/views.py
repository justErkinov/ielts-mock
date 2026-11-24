from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.core.cache import cache
from .models import User

MAX_FAILS = 20          # wrong passwords per username ...
FAIL_WINDOW = 5 * 60    # ... within 5 minutes, then wait
from .serializers import RegisterSerializer, UserSerializer

class RegisterView(APIView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            token, _ = Token.objects.get_or_create(user=user)
            return Response({'token': token.key, 'user': UserSerializer(user).data})
        return Response(serializer.errors, status=400)

class LoginView(APIView):
    def post(self, request):
        username = str(request.data.get('username') or '').strip()
        password = request.data.get('password') or ''
        key = f'login-fail:{username.lower()}'
        if cache.get(key, 0) >= MAX_FAILS:
            return Response({'error': "Juda ko'p noto'g'ri urinish. 5 daqiqadan keyin qayta urinib ko'ring."},
                            status=429)
        user = authenticate(username=username, password=password)
        if user is None:
            # "Ali" and "ali" are the same student
            match = User.objects.filter(username__iexact=username).first()
            if match and match.username != username:
                user = authenticate(username=match.username, password=password)
        if user:
            cache.delete(key)
            token, _ = Token.objects.get_or_create(user=user)
            return Response({'token': token.key, 'user': UserSerializer(user).data})
        cache.set(key, cache.get(key, 0) + 1, FAIL_WINDOW)
        return Response({'error': 'Username yoki parol noto\'g\'ri'}, status=400)

class MeView(APIView):
    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=401)
        return Response(UserSerializer(request.user).data)


class ReportViolationView(APIView):
    """
    Called by the frontend the moment a student leaves fullscreen, switches
    tabs, right-clicks, tries to copy, or opens devtools during a timed test.
    Sends an immediate alert to the teacher's Telegram so cheating attempts
    are visible in real time, not just at submission.
    """
    def post(self, request):
        if not request.user.is_authenticated:
            return Response(status=401)

        from notifications.telegram import notify_violation
        from datetime import datetime

        # A student cannot flood the teacher's Telegram by calling this directly
        key = f'violations:{request.user.pk}'
        sent = cache.get(key, 0)
        if sent >= 20:
            return Response({'status': 'ignored'})
        cache.set(key, sent + 1, 30 * 60)

        test_type = request.data.get('test_type', 'unknown')
        test_id = request.data.get('test_id', '')
        reason = request.data.get('reason', 'unknown')
        count = request.data.get('count', 1)

        notify_violation(
            user=request.user,
            test_type=test_type,
            test_id=test_id,
            reason=reason,
            count=count,
            when=datetime.now(),
        )
        return Response({'status': 'reported'})