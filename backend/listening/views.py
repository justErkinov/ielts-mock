from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ListeningTest, ListeningAttempt
from .serializers import ListeningTestSerializer
from grading import check, display


class ListeningTestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tests = ListeningTest.objects.filter(is_active=True).order_by('title')
        return Response(ListeningTestSerializer(tests, many=True).data)


class ListeningTestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            test = ListeningTest.objects.get(pk=pk)
        except ListeningTest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(ListeningTestSerializer(test).data)


class ListeningSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            test = ListeningTest.objects.get(pk=pk)
        except ListeningTest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        user_answers = request.data.get('answers', {}) or {}
        questions = test.questions.all()
        score = 0
        result_detail = {}

        for q in questions:
            num = str(q.question_number)
            given = user_answers.get(num, '')
            ok = check(given, q.correct_answer)
            score += ok
            result_detail[num] = {
                'your_answer': given,
                'correct_answer': display(q.correct_answer),
                'is_correct': ok,
            }

        attempt = ListeningAttempt.objects.create(
            user=request.user, test=test, answers=user_answers, score=score)

        from notifications.telegram import notify_listening
        notify_listening(request.user, attempt, time_info=request.data)

        return Response({'score': score, 'total': questions.count(),
                         'detail': result_detail, 'attempt_id': attempt.id})
