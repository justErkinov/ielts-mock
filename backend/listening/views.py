from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ListeningTest, ListeningQuestion, ListeningAttempt
from .serializers import ListeningTestSerializer, ListeningAttemptSerializer

class ListeningTestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tests = ListeningTest.objects.filter(is_active=True)
        return Response(ListeningTestSerializer(tests, many=True).data)

class ListeningTestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            test = ListeningTest.objects.get(pk=pk)
        except ListeningTest.DoesNotExist:
            return Response({'error': 'Topilmadi'}, status=404)
        return Response(ListeningTestSerializer(test).data)

class ListeningSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            test = ListeningTest.objects.get(pk=pk)
        except ListeningTest.DoesNotExist:
            return Response({'error': 'Topilmadi'}, status=404)

        user_answers = request.data.get('answers', {})

        # Ballni hisoblash
        questions = test.questions.all()
        score = 0
        result_detail = {}

        for q in questions:
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

        # Saqlash
        attempt = ListeningAttempt.objects.create(
            user=request.user,
            test=test,
            answers=user_answers,
            score=score,
        )

        # Telegram ga yuborish — faqat shu qatorni chaqiramiz
        from notifications.telegram import notify_listening
        notify_listening(request.user, attempt)

        return Response({
            'score': score,
            'total': questions.count(),
            'detail': result_detail,
            'attempt_id': attempt.id,
        })