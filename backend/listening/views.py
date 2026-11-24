from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ListeningTest, ListeningAttempt
import re
from django.db.models import Count
from .serializers import ListeningTestSerializer, ListeningTestListSerializer
from grading import check, display, PairGuard
from examutil import can_open, clean_answers, recent_duplicate, is_staff_user

PART_RE = re.compile(r'^(.*?)[\s,–—-]*Part\s*(\d+)\s*$', re.I)


def _base(title):
    m = PART_RE.match(title or '')
    return (m.group(1).strip() if m else (title or '').strip()).lower()


def _part_no(title):
    m = PART_RE.match(title or '')
    return int(m.group(2)) if m else 1


class ListeningTestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tests = ListeningTest.objects.filter(is_active=True)
        u = request.user
        # Teachers can open their own drafts from the studio ("Preview")
        if request.GET.get('preview') and (u.is_superuser or getattr(u, 'is_teacher', False)):
            drafts = ListeningTest.objects.filter(is_active=False)
            tests = tests | (drafts if u.is_superuser else drafts.filter(created_by=u))
        tests = tests.annotate(question_count=Count('questions')).order_by('title')
        return Response(ListeningTestListSerializer(tests, many=True).data)


class ListeningGroupView(APIView):
    """All parts (Part 1-4) of the Listening test that part <pk> belongs to, with questions."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            first = ListeningTest.objects.get(pk=pk)
        except ListeningTest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        u = request.user
        if not can_open(first, u):
            return Response({'error': 'Not found'}, status=404)
        base = _base(first.title)
        qs = ListeningTest.objects.prefetch_related('questions')
        qs = qs if (not first.is_active and is_staff_user(u)) else qs.filter(is_active=True)
        parts = [t for t in qs if _base(t.title) == base and can_open(t, u)]
        parts.sort(key=lambda t: _part_no(t.title))
        return Response(ListeningTestSerializer(parts, many=True).data)


class ListeningTestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            test = ListeningTest.objects.prefetch_related('questions').get(pk=pk)
        except ListeningTest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if not can_open(test, request.user):
            return Response({'error': 'Not found'}, status=404)
        return Response(ListeningTestSerializer(test).data)


class ListeningSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            test = ListeningTest.objects.get(pk=pk)
        except ListeningTest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if not can_open(test, request.user):
            return Response({'error': 'Not found'}, status=404)

        user_answers = clean_answers(request.data.get('answers'))
        if user_answers is None:
            return Response({'error': 'Bad answers'}, status=400)
        questions = test.questions.all()
        score = 0
        result_detail = {}
        guard = PairGuard()

        for q in questions:
            num = str(q.question_number)
            given = user_answers.get(num, '')
            ok = guard.check(given, q.correct_answer, q.question_type)
            score += ok
            result_detail[num] = {
                'your_answer': given,
                'correct_answer': display(q.correct_answer),
                'is_correct': ok,
            }

        attempt = recent_duplicate(ListeningAttempt, request.user, test, answers=user_answers)
        if attempt is None:
            attempt = ListeningAttempt.objects.create(
                user=request.user, test=test, answers=user_answers, score=score)
            from notifications.telegram import notify_listening
            notify_listening(request.user, attempt, time_info=request.data)

        return Response({'score': score, 'total': questions.count(),
                         'detail': result_detail, 'attempt_id': attempt.id})


class ListeningGroupSubmitView(APIView):
    """
    Submits a whole Listening test (Part 1-4 stored as separate ListeningTest
    rows) in one request: {"parts": {"<test_id>": {"<q_no>": "answer"}}, ...timing}.
    Creates one attempt per part and sends ONE Telegram message with the total.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        parts = request.data.get('parts') or {}
        if not isinstance(parts, dict):
            return Response({'error': 'Bad answers'}, status=400)
        cleaned = {}
        for k, v in parts.items():
            a = clean_answers(v)
            if a is None or not str(k).isdigit():
                return Response({'error': 'Bad answers'}, status=400)
            cleaned[str(int(k))] = a
        parts = cleaned
        tests = [t for t in ListeningTest.objects.prefetch_related('questions').filter(pk__in=[int(k) for k in parts])
                 if can_open(t, request.user)]
        if not tests:
            return Response({'error': 'No tests submitted'}, status=400)

        score = total = 0
        detail = {}
        part_scores = []
        # Same answers sent again (browser retry after a network drop): no new attempts / message
        repeat = all(recent_duplicate(ListeningAttempt, request.user, t, answers=parts.get(str(t.pk)) or {})
                     for t in tests)
        for test in sorted(tests, key=lambda t: _part_no(t.title)):
            answers = parts.get(str(test.pk)) or {}
            part_score = 0
            guard = PairGuard()
            questions = list(test.questions.all())
            for q in questions:
                num = str(q.question_number)
                given = answers.get(num, '')
                ok = guard.check(given, q.correct_answer, q.question_type)
                part_score += ok
                detail[num] = {'your_answer': given, 'correct_answer': display(q.correct_answer), 'is_correct': ok}
            if not repeat:
                ListeningAttempt.objects.create(user=request.user, test=test, answers=answers, score=part_score)
            part_scores.append((test.title, part_score, len(questions)))
            score += part_score
            total += len(questions)

        if not repeat:
            from notifications.telegram import notify_listening_group
            notify_listening_group(request.user, part_scores, score, total, time_info=request.data)

        detail = dict(sorted(detail.items(), key=lambda kv: int(kv[0])))
        return Response({'score': score, 'total': total, 'detail': detail})
