from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import WritingTest, WritingAttempt
from .serializers import WritingTestSerializer, WritingAttemptSerializer

class WritingTestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tests = WritingTest.objects.filter(is_active=True)
        serializer = WritingTestSerializer(
            tests, many=True, context={'request': request}
        )
        return Response(serializer.data)

class WritingTestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            test = WritingTest.objects.get(pk=pk)
        except WritingTest.DoesNotExist:
            return Response({'error': 'Topilmadi'}, status=404)
        serializer = WritingTestSerializer(test, context={'request': request})
        return Response(serializer.data)

class WritingSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            test = WritingTest.objects.get(pk=pk)
        except WritingTest.DoesNotExist:
            return Response({'error': 'Topilmadi'}, status=404)

        task1 = request.data.get('task1_text', '').strip()
        task2 = request.data.get('task2_text', '').strip()

        if not task1 or not task2:
            return Response(
                {'error': 'Task 1 va Task 2 bo\'sh bo\'lmasin'}, status=400
            )

        attempt = WritingAttempt.objects.create(
            user=request.user,
            test=test,
            task1_text=task1,
            task2_text=task2,
        )

        from notifications.telegram import notify_writing
        notify_writing(request.user, attempt, time_info=request.data)

        return Response({
            'message': 'Muvaffaqiyatli topshirildi. Ustoz tekshiradi.',
            'attempt_id': attempt.id,
        }, status=201)

class WritingMyAttemptsView(APIView):
    """O'quvchi o'z natijalarini ko'radi"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        attempts = WritingAttempt.objects.filter(user=request.user)
        return Response(WritingAttemptSerializer(attempts, many=True).data)