from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ReadingTest, ReadingAttempt
from .serializers import ReadingTestSerializer
from grading import check, display


class ReadingTestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tests = ReadingTest.objects.filter(is_active=True).order_by('title')
        return Response(ReadingTestSerializer(tests, many=True).data)


class ReadingTestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            test = ReadingTest.objects.get(pk=pk)
        except ReadingTest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(ReadingTestSerializer(test).data)


class ReadingSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            test = ReadingTest.objects.get(pk=pk)
        except ReadingTest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        user_answers = request.data.get('answers', {}) or {}
        score = 0
        total = 0
        result_detail = {}

        for passage in test.passages.all():
            for q in passage.questions.all():
                total += 1
                num = str(q.question_number)
                given = user_answers.get(num, '')
                ok = check(given, q.correct_answer)
                score += ok
                result_detail[num] = {
                    'your_answer': given,
                    'correct_answer': display(q.correct_answer),
                    'is_correct': ok,
                }

        attempt = ReadingAttempt.objects.create(
            user=request.user, test=test, answers=user_answers, score=score)

        from notifications.telegram import notify_reading
        notify_reading(request.user, attempt, time_info=request.data)

        return Response({'score': score, 'total': total,
                         'detail': result_detail, 'attempt_id': attempt.id})
