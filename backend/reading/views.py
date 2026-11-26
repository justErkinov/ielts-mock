from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ReadingTest, ReadingAttempt
from django.db.models import Count
from .serializers import ReadingTestSerializer, ReadingTestListSerializer
from grading import check, display, show, review, PairGuard
from examutil import can_open, clean_answers, recent_duplicate


class ReadingTestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tests = ReadingTest.objects.filter(is_active=True).annotate(
            passages_count=Count('passages')).order_by('title')
        return Response(ReadingTestListSerializer(tests, many=True).data)


class ReadingTestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            test = ReadingTest.objects.prefetch_related('passages__questions').get(pk=pk)
        except ReadingTest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if not can_open(test, request.user):
            return Response({'error': 'Not found'}, status=404)
        return Response(ReadingTestSerializer(test).data)


class ReadingSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            test = ReadingTest.objects.prefetch_related('passages__questions').get(pk=pk)
        except ReadingTest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if not can_open(test, request.user):
            return Response({'error': 'Not found'}, status=404)

        user_answers = clean_answers(request.data.get('answers'))
        if user_answers is None:
            return Response({'error': 'Bad answers'}, status=400)
        score = 0
        total = 0
        result_detail = {}
        guard = PairGuard()

        for passage in test.passages.all():
            for q in passage.questions.all():
                total += 1
                num = str(q.question_number)
                given = user_answers.get(num, '')
                ok = guard.check(given, q.correct_answer, q.question_type)
                score += ok
                result_detail[num] = review(q, given, ok)

        attempt = recent_duplicate(ReadingAttempt, request.user, test, answers=user_answers)
        if attempt is None:
            attempt = ReadingAttempt.objects.create(
                user=request.user, test=test, answers=user_answers, score=score)
            from notifications.telegram import notify_reading
            notify_reading(request.user, attempt, time_info=request.data)

        return Response({'score': score, 'total': total,
                         'detail': result_detail, 'attempt_id': attempt.id})
