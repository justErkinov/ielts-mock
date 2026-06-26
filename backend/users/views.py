from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
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
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(username=username, password=password)
        if user:
            token, _ = Token.objects.get_or_create(user=user)
            return Response({'token': token.key, 'user': UserSerializer(user).data})
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