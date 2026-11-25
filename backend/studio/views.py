"""
Teacher studio API: add and edit Listening / Reading / Writing tests from the website,
by pasting the questions and the answer key as plain text (see textformat.py).
Teachers see and change only their own tests; the superuser sees all.
"""
import re

from django.db import transaction
from django.http import HttpResponse, Http404
from rest_framework.permissions import BasePermission, IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from listening.models import ListeningTest, ListeningQuestion
from reading.models import ReadingTest, ReadingPassage, ReadingQuestion
from writing.models import WritingTest
from django.http import StreamingHttpResponse
from .models import MediaFile, MediaChunk
from . import storage
from .storage import save_upload, cloudinary_ready, CHUNK_SIZE
from .textformat import parse, to_text
from django.conf import settings


class IsTeacher(BasePermission):
    message = 'Only teachers can use the test studio.'

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.is_superuser or getattr(u, 'is_teacher', False)))


def _mine(qs, user):
    return qs if user.is_superuser else qs.filter(created_by=user)


PART_RE = re.compile(r'^(.*?)[\s,–—-]*Part\s*(\d+)\s*$', re.I)


def split_title(title):
    m = PART_RE.match(title or '')
    return (m.group(1).strip(), int(m.group(2))) if m else ((title or '').strip(), 1)


def _listening_group(user, any_id):
    try:
        t = _mine(ListeningTest.objects.all(), user).get(pk=any_id)
    except ListeningTest.DoesNotExist:
        raise Http404
    base, _ = split_title(t.title)
    parts = [x for x in _mine(ListeningTest.objects.all(), user) if split_title(x.title)[0] == base]
    return base, sorted(parts, key=lambda x: split_title(x.title)[1])


def _owner_name(t):
    u = t.created_by
    return (u.get_full_name() or u.username) if u else ''


def _questions_payload(qs):
    return [{k: q[k] for k in ('question_number', 'question_type', 'question_text', 'options',
                               'correct_answer', 'group_title', 'group_instruction')} for q in qs]


# ------------------------------------------------------------------ general

class StudioInfoView(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        return Response({'storage': 'cloudinary' if cloudinary_ready() else 'database',
                         'max_upload_mb': settings.MAX_UPLOAD_MB})


class StudioTestsView(APIView):
    """Everything this teacher has made, newest first."""
    permission_classes = [IsTeacher]

    def get(self, request):
        u = request.user
        out = []
        groups = {}
        for t in _mine(ListeningTest.objects.all(), u).prefetch_related('questions'):
            base, part = split_title(t.title)
            g = groups.setdefault(base, {'kind': 'listening', 'title': base, 'parts': [],
                                         'questions': 0, 'is_active': True,
                                         'created_at': t.created_at, 'owner': _owner_name(t)})
            g['parts'].append((part, t.pk))
            g['questions'] += t.questions.count()
            g['is_active'] = g['is_active'] and t.is_active
            g['created_at'] = max(g['created_at'], t.created_at)
        for g in groups.values():
            g['parts'].sort()
            g['id'] = g['parts'][0][1]
            g['detail'] = f"{len(g['parts'])} part{'s' if len(g['parts']) != 1 else ''}"
            del g['parts']
            out.append(g)
        for t in _mine(ReadingTest.objects.all(), u).prefetch_related('passages__questions'):
            ps = list(t.passages.all())
            out.append({'kind': 'reading', 'id': t.pk, 'title': t.title, 'is_active': t.is_active,
                        'questions': sum(p.questions.count() for p in ps),
                        'detail': f"{len(ps)} passage{'s' if len(ps) != 1 else ''}",
                        'created_at': t.created_at, 'owner': _owner_name(t)})
        for t in _mine(WritingTest.objects.all(), u):
            out.append({'kind': 'writing', 'id': t.pk, 'title': t.title, 'is_active': t.is_active,
                        'questions': 2, 'detail': 'Task 1 + Task 2',
                        'created_at': t.created_at, 'owner': _owner_name(t)})
        out.sort(key=lambda x: x['created_at'], reverse=True)
        return Response(out)


class ParseView(APIView):
    """Live preview while the teacher types."""
    permission_classes = [IsTeacher]

    def post(self, request):
        d = request.data
        r = parse(d.get('kind', 'listening'), d.get('questions', ''), d.get('answers', ''),
                  d.get('first'), d.get('last'))
        return Response(r)


class UploadView(APIView):
    """Small files in one request (kept for compatibility)."""
    permission_classes = [IsTeacher]

    def post(self, request):
        f = request.FILES.get('file')
        if not f:
            return Response({'error': 'No file received.'}, status=400)
        try:
            url, where = save_upload(f, request.user, request)
        except ValueError as e:
            return Response({'error': str(e)}, status=400)
        except Exception:
            return Response({'error': 'Upload failed. Check the internet connection and try again.'}, status=502)
        return Response({'url': url, 'storage': where, 'name': f.name, 'size': f.size})


class ImportListeningView(APIView):
    """A whole Listening test from a PDF / Word file (or pasted text):
    -> {parts: [{questions, answers}] x4, warnings}. Pictures are saved and placed."""
    permission_classes = [IsTeacher]

    def post(self, request):
        from .importer import import_listening
        f = request.FILES.get('file')
        if f is not None:
            if f.size > 30 * 1024 * 1024:
                return Response({'error': 'The file is too big (limit 30 MB).'}, status=400)
            name, data = f.name, f.read()
        else:
            name, data = 'pasted.txt', str(request.data.get('text') or '').encode('utf-8')
        if not data.strip():
            return Response({'error': 'The file is empty.'}, status=400)

        def save_image(img_name, img_data):
            try:
                return storage.save_bytes(img_name, img_data, request.user, request)
            except Exception:
                return None
        try:
            parts, warnings = import_listening(name, data, save_image)
        except Exception:
            return Response({'error': "This file could not be read. Save it as PDF or Word (.docx) and try again, "
                                      "or copy the text and paste it."}, status=400)
        if not any(p['questions'].strip() for p in parts):
            return Response({'error': 'No questions were found in this file. Is it a scanned picture? '
                                      'Then copy the questions as text instead.'}, status=400)
        return Response({'parts': parts, 'warnings': warnings})


class UploadStartView(APIView):
    """Chunked upload, step 1: {name, type, size} -> {id, chunk_size}"""
    permission_classes = [IsTeacher]

    def post(self, request):
        d = request.data
        try:
            m = storage.start(d.get('name', ''), d.get('type', ''), int(d.get('size') or 0), request.user)
        except ValueError as e:
            return Response({'error': str(e)}, status=400)
        return Response({'id': str(m.id), 'chunk_size': CHUNK_SIZE})


def _my_upload(request, pk):
    try:
        return MediaFile.objects.get(pk=pk, uploaded_by=request.user)
    except (MediaFile.DoesNotExist, ValueError):
        raise Http404


class UploadChunkView(APIView):
    """Step 2 (repeat): multipart {index, file}"""
    permission_classes = [IsTeacher]

    def post(self, request, pk):
        m = _my_upload(request, pk)
        f = request.FILES.get('file')
        try:
            index = int(request.data.get('index'))
            if f is None:
                raise ValueError('No file piece received.')
            storage.put_chunk(m, index, f.read())
        except (TypeError, ValueError) as e:
            return Response({'error': str(e) or 'Bad file piece.'}, status=400)
        return Response({'ok': True})


class UploadFinishView(APIView):
    """Step 3: -> {url}"""
    permission_classes = [IsTeacher]

    def post(self, request, pk):
        m = _my_upload(request, pk)
        try:
            url, where = storage.finish(m, request)
        except ValueError as e:
            return Response({'error': str(e)}, status=400)
        except Exception:
            return Response({'error': 'Saving the file failed. Please try again.'}, status=502)
        return Response({'url': url, 'storage': where, 'name': m.name, 'size': m.size})


class MediaView(APIView):
    """Serves files kept in the database, piece by piece. Supports Range requests,
    so audio starts at once and the browser can resume."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, pk, name=None):
        try:
            m = MediaFile.objects.only('content_type', 'size', 'complete').get(pk=pk)
        except (MediaFile.DoesNotExist, ValueError):
            raise Http404
        if not m.complete:
            raise Http404
        size = m.size
        start, end, status = 0, size - 1, 200
        mm = re.match(r'bytes=(\d*)-(\d*)', request.META.get('HTTP_RANGE', ''))
        if mm and (mm.group(1) or mm.group(2)):
            if mm.group(1):
                start = int(mm.group(1))
                end = min(int(mm.group(2)) if mm.group(2) else size - 1, size - 1)
            else:
                start = max(0, size - int(mm.group(2)))
            if start > end:
                resp = HttpResponse(status=416)
                resp['Content-Range'] = f'bytes */{size}'
                return resp
            status = 206

        has_chunks = MediaChunk.objects.filter(file_id=m.pk).exists()

        def body():
            if not has_chunks:   # older single-piece upload
                yield bytes(MediaFile.objects.values_list('data', flat=True).get(pk=m.pk))[start:end + 1]
                return
            first, last = start // CHUNK_SIZE, end // CHUNK_SIZE
            for idx in range(first, last + 1):
                data = bytes(MediaChunk.objects.values_list('data', flat=True).get(file_id=m.pk, index=idx))
                lo = start - idx * CHUNK_SIZE if idx == first else 0
                hi = end - idx * CHUNK_SIZE + 1 if idx == last else len(data)
                yield data[lo:hi]

        resp = StreamingHttpResponse(body(), status=status, content_type=m.content_type)
        resp['Content-Length'] = str(end - start + 1)
        if status == 206:
            resp['Content-Range'] = f'bytes {start}-{end}/{size}'
        resp['Accept-Ranges'] = 'bytes'
        resp['Cache-Control'] = 'public, max-age=31536000, immutable'
        resp['Access-Control-Allow-Origin'] = '*'
        return resp


def _check(errors, is_active):
    """Drafts may be saved with problems; a published test must be clean."""
    if errors and is_active:
        return Response({'errors': errors,
                         'error': 'Fix the problems below before publishing, or save as a draft.'}, status=400)
    return None


# ------------------------------------------------------------------ listening

class ListeningStudioView(APIView):
    """
    One Listening test = up to 4 parts. Saved as ListeningTest rows titled
    "<title>, Part N" (that is how the student page groups them).
    Body: {title, is_active, parts: [{audio_url, questions, answers}]}
    """
    permission_classes = [IsTeacher]

    def get(self, request, pk):
        base, parts = _listening_group(request.user, pk)
        out = []
        for t in parts:
            qt, at = to_text('listening', list(t.questions.all())) if t.questions.exists() else ('', '')
            out.append({'id': t.pk, 'audio_url': t.audio_url, 'questions': qt, 'answers': at})
        return Response({'id': parts[0].pk, 'title': base, 'is_active': all(t.is_active for t in parts),
                         'parts': out})

    def post(self, request, pk=None):
        return self._save(request, None)

    def put(self, request, pk):
        return self._save(request, pk)

    def delete(self, request, pk):
        _, parts = _listening_group(request.user, pk)
        for t in parts:
            t.delete()
        return Response(status=204)

    @transaction.atomic
    def _save(self, request, pk):
        d = request.data
        title = (d.get('title') or '').strip()
        is_active = bool(d.get('is_active'))
        parts_in = d.get('parts') or []
        errors, parsed = [], []
        if not title:
            errors.append('Write the test title.')
        if not parts_in:
            errors.append('Add at least one part.')
        for i, p in enumerate(parts_in, start=1):
            r = parse('listening', p.get('questions', ''), p.get('answers', ''), (i - 1) * 10 + 1, i * 10)
            errors += [f'Part {i}: {e}' for e in r['errors']]
            if not (p.get('audio_url') or '').strip():
                errors.append(f'Part {i}: upload the audio file.')
            if not r['questions']:
                errors.append(f'Part {i}: no questions found.')
            parsed.append((p, r['questions']))
        if not title or not parts_in:
            return Response({'errors': errors, 'error': errors[0]}, status=400)
        bad = _check(errors, is_active)
        if bad:
            return bad

        existing = _listening_group(request.user, pk)[1] if pk else []
        # Students' list groups parts by title, so two tests must not share one
        mine = {t.pk for t in existing}
        if any(split_title(t.title)[0].lower() == title.lower() and t.pk not in mine
               for t in ListeningTest.objects.all()):
            return Response({'errors': [f'A Listening test called "{title}" already exists. Choose another title.'],
                             'error': 'This title is already used.'}, status=400)
        saved = []
        for i, (p, qs) in enumerate(parsed, start=1):
            t = existing[i - 1] if i - 1 < len(existing) else ListeningTest(created_by=request.user)
            t.title = f'{title}, Part {i}'
            t.audio_url = (p.get('audio_url') or '').strip()
            t.is_active = is_active
            t.save()
            t.questions.all().delete()
            ListeningQuestion.objects.bulk_create([ListeningQuestion(test=t, **{
                k: q[k] for k in ('question_number', 'question_type', 'question_text', 'options',
                                  'correct_answer', 'group_title', 'group_instruction')}) for q in qs])
            saved.append(t)
        for t in existing[len(parsed):]:   # parts that were removed
            t.delete()
        return Response({'id': saved[0].pk, 'saved': True, 'warnings': errors})


# ------------------------------------------------------------------ reading

class ReadingStudioView(APIView):
    """Body: {title, is_active, passages: [{title, text, questions, answers}]}"""
    permission_classes = [IsTeacher]

    def _get(self, request, pk):
        try:
            return _mine(ReadingTest.objects.all(), request.user).get(pk=pk)
        except ReadingTest.DoesNotExist:
            raise Http404

    def get(self, request, pk):
        t = self._get(request, pk)
        out = []
        for p in t.passages.all():
            qs = list(p.questions.all())
            qt, at = to_text('reading', qs) if qs else ('', '')
            out.append({'id': p.pk, 'title': p.title, 'text': p.text, 'questions': qt, 'answers': at})
        return Response({'id': t.pk, 'title': t.title, 'is_active': t.is_active, 'passages': out})

    def post(self, request, pk=None):
        return self._save(request, None)

    def put(self, request, pk):
        return self._save(request, self._get(request, pk))

    def delete(self, request, pk):
        self._get(request, pk).delete()
        return Response(status=204)

    @transaction.atomic
    def _save(self, request, test):
        d = request.data
        title = (d.get('title') or '').strip()
        is_active = bool(d.get('is_active'))
        ps_in = d.get('passages') or []
        errors, parsed = [], []
        if not title:
            errors.append('Write the test title.')
        if not ps_in:
            errors.append('Add at least one passage.')
        all_nums = []
        for i, p in enumerate(ps_in, start=1):
            if not (p.get('text') or '').strip():
                errors.append(f'Passage {i}: paste the passage text.')
            r = parse('reading', p.get('questions', ''), p.get('answers', ''))
            errors += [f'Passage {i}: {e}' for e in r['errors']]
            if not r['questions']:
                errors.append(f'Passage {i}: no questions found.')
            all_nums += [q['question_number'] for q in r['questions']]
            parsed.append((p, r['questions']))
        dup = sorted({n for n in all_nums if all_nums.count(n) > 1})
        if dup:
            errors.append(f"Question numbers used in two passages: {', '.join(map(str, dup))}.")
        if not title or not ps_in:
            return Response({'errors': errors, 'error': errors[0]}, status=400)
        bad = _check(errors, is_active)
        if bad:
            return bad

        if test is None:
            test = ReadingTest(created_by=request.user)
        test.title, test.is_active = title, is_active
        test.save()
        old = {p.passage_number: p for p in test.passages.all()}
        for i, (p, qs) in enumerate(parsed, start=1):
            passage = old.pop(i, None) or ReadingPassage(test=test, passage_number=i)
            passage.title = (p.get('title') or f'Passage {i}').strip()
            passage.text = (p.get('text') or '').strip()
            passage.save()
            passage.questions.all().delete()
            ReadingQuestion.objects.bulk_create([ReadingQuestion(passage=passage, **{
                k: q[k] for k in ('question_number', 'question_type', 'question_text', 'options',
                                  'correct_answer', 'group_title', 'group_instruction')}) for q in qs])
        for p in old.values():
            p.delete()
        return Response({'id': test.pk, 'saved': True, 'warnings': errors})


# ------------------------------------------------------------------ writing

IMG_TOKEN = re.compile(r'\[img:([^\]]+)\]\s*')


class WritingStudioView(APIView):
    """Body: {title, is_active, task1, task1_image (url), task2}"""
    permission_classes = [IsTeacher]

    def _get(self, request, pk):
        try:
            return _mine(WritingTest.objects.all(), request.user).get(pk=pk)
        except WritingTest.DoesNotExist:
            raise Http404

    def get(self, request, pk):
        t = self._get(request, pk)
        m = IMG_TOKEN.search(t.task1_question or '')
        img = m.group(1) if m else (request.build_absolute_uri(t.task1_image.url) if t.task1_image else '')
        return Response({'id': t.pk, 'title': t.title, 'is_active': t.is_active,
                         'task1': IMG_TOKEN.sub('', t.task1_question or '').strip(),
                         'task1_image': img, 'task2': t.task2_question})

    def post(self, request, pk=None):
        return self._save(request, None)

    def put(self, request, pk):
        return self._save(request, self._get(request, pk))

    def delete(self, request, pk):
        self._get(request, pk).delete()
        return Response(status=204)

    def _save(self, request, test):
        d = request.data
        title = (d.get('title') or '').strip()
        is_active = bool(d.get('is_active'))
        t1, t2 = (d.get('task1') or '').strip(), (d.get('task2') or '').strip()
        img = (d.get('task1_image') or '').strip()
        errors = []
        if not title:
            errors.append('Write the test title.')
        if not t1:
            errors.append('Write the Task 1 question.')
        if not t2:
            errors.append('Write the Task 2 question.')
        warnings = [] if img else ['Task 1 has no picture (graph, map or diagram).']
        if not title:
            return Response({'errors': errors, 'error': errors[0]}, status=400)
        bad = _check(errors, is_active)
        if bad:
            return bad
        if test is None:
            test = WritingTest(created_by=request.user)
        test.title, test.is_active = title, is_active
        test.task1_question = (f'[img:{img}]\n' if img else '') + t1
        test.task2_question = t2
        if img:
            test.task1_image = None   # the picture now lives in the [img:...] link
        test.save()
        return Response({'id': test.pk, 'saved': True, 'warnings': errors + warnings})
