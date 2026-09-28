from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ReadingTest, ReadingAttempt
from .serializers import ReadingTestSerializer

class ReadingTestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tests = ReadingTest.objects.filter(is_active=True)
        return Response(ReadingTestSerializer(tests, many=True).data)

class ReadingTestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            test = ReadingTest.objects.get(pk=pk)
        except ReadingTest.DoesNotExist:
            return Response({'error': 'Topilmadi'}, status=404)
        return Response(ReadingTestSerializer(test).data)

class ReadingSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            test = ReadingTest.objects.get(pk=pk)
        except ReadingTest.DoesNotExist:
            return Response({'error': 'Topilmadi'}, status=404)

        user_answers = request.data.get('answers', {})

        # Barcha passagelardan savollarni yig'amiz
        score = 0
        result_detail = {}
        total = 0

        for passage in test.passages.all():
            for q in passage.questions.all():
                total += 1
                num = str(q.question_number)
                user_ans = user_answers.get(num, '').strip().lower()
                correct = q.correct_answer.strip().lower()
                is_correct = user_ans == correct
                if is_correct:
                    score += 1
                result_detail[num] = {
                    'your_answer': user_answers.get(num, ''),
                    'correct_answer': q.correct_answer,
                    'is_correct': is_correct,
                }

        attempt = ReadingAttempt.objects.create(
            user=request.user,
            test=test,
            answers=user_answers,
            score=score,
        )

        from notifications.telegram import notify_reading
        notify_reading(request.user, attempt, time_info=request.data)

        return Response({
            'score': score,
            'total': total,
            'detail': result_detail,
            'attempt_id': attempt.id,
        })