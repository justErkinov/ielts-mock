"""The website's API: sign-in, tests, submitting, the teacher studio, uploads, import."""
import io
from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from listening.models import ListeningTest, ListeningAttempt
from reading.models import ReadingTest, ReadingAttempt
from users.models import User
from writing.models import WritingTest, WritingAttempt

L_TEXT = """Questions 1-3
Complete the notes below.
• Name: Sarah 1 ……
• Price: £ 2 ……
• Day 3 ……
Questions 4-5
Choose TWO letters, A-E.
Which TWO problems are mentioned?
A cost
B noise
C traffic
D space
E time"""
L_KEY = "1 Jenkins\n2 85\n3 Friday\n4-5 B, D"
R_TEXT = """Questions 1-2
Do the following statements agree with the information given in Reading Passage 1?
Write TRUE, FALSE or NOT GIVEN.
1 The bridge is old.
2 The bridge is red."""


def client(user=None):
    c = APIClient()
    if user:
        c.force_authenticate(user)
    return c


class Base(TestCase):
    def setUp(self):
        cache.clear()
        self.teacher = User.objects.create_user('ustoz', 'u@u.uz', 'TeacherPass1!', is_teacher=True)
        self.other = User.objects.create_user('ustoz2', 'v@u.uz', 'TeacherPass1!', is_teacher=True)
        self.student = User.objects.create_user('Ali', 'a@a.uz', 'StudentPass1!', first_name='Ali')
        self.t, self.s = client(self.teacher), client(self.student)

    def make_listening(self, title='Mock 1', active=True):
        r = self.t.post('/api/studio/listening/', {'title': title, 'is_active': active, 'parts': [
            {'audio_url': 'https://x/a.mp3', 'questions': L_TEXT, 'answers': L_KEY}]}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data['id']

    def make_reading(self, active=True):
        r = self.t.post('/api/studio/reading/', {'title': 'Reading 1', 'is_active': active, 'passages': [
            {'title': 'Bridges', 'text': 'A\nOld text.', 'questions': R_TEXT, 'answers': '1 T\n2 NG'}]}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data['id']


class AuthTests(Base):
    def test_login_ignores_case_and_locks_after_many_wrong_passwords(self):
        a = client()
        self.assertEqual(a.post('/api/users/login/', {'username': 'ali', 'password': 'StudentPass1!'}).status_code, 200)
        for _ in range(20):
            a.post('/api/users/login/', {'username': 'ali', 'password': 'bad'})
        self.assertEqual(a.post('/api/users/login/', {'username': 'ali', 'password': 'StudentPass1!'}).status_code, 429)

    def test_register_checks_password_and_name(self):
        a = client()
        r = a.post('/api/users/register/', {'username': 'new', 'email': 'n@n.uz', 'password': '12345678'})
        self.assertEqual(r.status_code, 400)
        r = a.post('/api/users/register/', {'username': 'ALI', 'email': 'n@n.uz', 'password': 'Gr8Passw0rd!'})
        self.assertIn('username', r.data)
        r = a.post('/api/users/register/', {'username': 'new', 'email': 'n@n.uz', 'password': 'Gr8Passw0rd!'})
        self.assertIn(r.status_code, (200, 201), r.data)
        self.assertIn('token', r.data)

    def test_me_shows_role(self):
        self.assertTrue(self.t.get('/api/users/me/').data['is_teacher'])
        self.assertFalse(self.s.get('/api/users/me/').data['is_teacher'])


class ExamTests(Base):
    def test_listening_grading_review_and_no_duplicates(self):
        lid = self.make_listening()
        g = self.s.get(f'/api/listening/{lid}/group/').data
        self.assertNotIn('correct_answer', g[0]['questions'][0])            # answers never sent to students
        body = {'parts': {str(lid): {'1': ' jenkins ', '2': '£85', '3': 'friday', '4': 'noise', '5': 'noise'}}}
        r = self.s.post('/api/listening/submit-all/', body, format='json')
        self.assertEqual((r.data['score'], r.data['total']), (4, 5))      # same letter twice -> one mark
        self.assertIn('already counted', r.data['detail']['5']['correct_answer'])
        self.assertEqual(r.data['detail']['4']['your_answer'], 'B. noise')
        self.s.post('/api/listening/submit-all/', body, format='json')     # browser resend
        self.assertEqual(ListeningAttempt.objects.count(), 1)

    def test_bad_answers_are_refused(self):
        lid = self.make_listening()
        self.assertEqual(self.s.post('/api/listening/submit-all/', {'parts': {str(lid): ['x']}}, format='json').status_code, 400)

    def test_drafts_are_hidden_from_students(self):
        rid = self.make_reading(active=False)
        self.assertEqual(self.s.get(f'/api/reading/{rid}/').status_code, 404)
        self.assertEqual(self.s.post(f'/api/reading/{rid}/submit/', {'answers': {}}, format='json').status_code, 404)
        self.assertEqual(self.t.get(f'/api/reading/{rid}/').status_code, 200)   # the author can preview
        self.assertEqual(self.s.get('/api/reading/').data, [])

    def test_reading_submit(self):
        rid = self.make_reading()
        r = self.s.post(f'/api/reading/{rid}/submit/', {'answers': {'1': 'TRUE', '2': 'FALSE'}}, format='json')
        self.assertEqual((r.data['score'], r.data['total']), (1, 2))
        self.assertEqual(ReadingAttempt.objects.count(), 1)

    def test_writing_full_essay_reaches_telegram_in_order(self):
        w = WritingTest.objects.create(title='W', task1_question='T1', task2_question='T2', created_by=self.teacher)
        essay = 'word ' * 1500
        sent = []
        with mock.patch('notifications.telegram._send', side_effect=lambda *m: sent.append(m)):
            r = self.s.post(f'/api/writing/{w.pk}/submit/', {'task1_text': '', 'task2_text': essay}, format='json')
            self.s.post(f'/api/writing/{w.pk}/submit/', {'task1_text': '', 'task2_text': essay}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(WritingAttempt.objects.count(), 1)
        self.assertEqual(len(sent), 1)
        self.assertIn('NOT WRITTEN', sent[0][0])
        self.assertTrue(sent[0][1].rstrip().endswith('word'))              # the whole essay, nothing cut
        self.assertEqual(sent[0][1].split('\n\n', 1)[1].count('word'), 1500)


class StudioTests(Base):
    def test_only_teachers(self):
        self.assertEqual(self.s.get('/api/studio/tests/').status_code, 403)

    def test_teachers_see_only_their_own(self):
        lid = self.make_listening()
        self.assertEqual(client(self.other).get(f'/api/studio/listening/{lid}/').status_code, 404)
        self.assertEqual(len(client(self.other).get('/api/studio/tests/').data), 0)

    def test_publish_is_refused_with_problems_but_draft_is_saved(self):
        body = {'title': 'Broken', 'is_active': True, 'parts': [{'audio_url': 'x', 'questions': L_TEXT, 'answers': '1 a'}]}
        self.assertEqual(self.t.post('/api/studio/listening/', body, format='json').status_code, 400)
        body['is_active'] = False
        self.assertEqual(self.t.post('/api/studio/listening/', body, format='json').status_code, 200)

    def test_edit_keeps_ids_and_duplicate_titles_are_refused(self):
        lid = self.make_listening()
        data = self.t.get(f'/api/studio/listening/{lid}/').data
        self.assertIn('1 Jenkins', data['parts'][0]['answers'])
        data['title'] = 'Mock 1 renamed'
        self.assertEqual(self.t.put(f'/api/studio/listening/{lid}/', data, format='json').data['id'], lid)
        r = self.t.post('/api/studio/listening/', {**data, 'title': 'mock 1 RENAMED'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_chunked_upload_and_audio_ranges(self):
        blob = bytes(range(256)) * 20000                                    # ~5 MB
        st = self.t.post('/api/studio/upload/start/', {'name': 'a.mp3', 'type': 'audio/mpeg', 'size': len(blob)}, format='json').data
        n = (len(blob) + st['chunk_size'] - 1) // st['chunk_size']
        for i in range(n):
            piece = blob[i * st['chunk_size']:(i + 1) * st['chunk_size']]
            self.t.post(f"/api/studio/upload/{st['id']}/chunk/", {'index': i, 'file': SimpleUploadedFile('p', piece)}, format='multipart')
        url = self.t.post(f"/api/studio/upload/{st['id']}/finish/").data['url']
        path = url.split('testserver')[1]
        self.assertEqual(b''.join(client().get(path).streaming_content), blob)
        cs = st['chunk_size']
        r = client().get(path, HTTP_RANGE=f'bytes={cs - 3}-{cs + 2}')
        self.assertEqual((r.status_code, b''.join(r.streaming_content)), (206, blob[cs - 3:cs + 3]))

    def test_upload_refuses_other_files(self):
        r = self.t.post('/api/studio/upload/start/', {'name': 'x.exe', 'type': 'application/x-msdownload', 'size': 10}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_import_word_file(self):
        from docx import Document
        d = Document()
        for line in ['PART 1', 'Questions 1-2', 'Complete the notes below.', 'Name: 1 ______', 'Day: 2 ______',
                     'PART 2', 'Questions 11-12', 'Choose the correct letter, A, B or C.',
                     '11 Who pays?', 'A parents', 'B school', 'C city', '12 When?', 'A May', 'B June', 'C July', 'Answer key']:
            d.add_paragraph(line)
        t = d.add_table(rows=4, cols=2)
        for row, (n, a) in zip(t.rows, [('1', 'Jenkins'), ('2', 'Friday'), ('11', 'C'), ('12', 'B')]):
            row.cells[0].text, row.cells[1].text = n, a
        buf = io.BytesIO(); d.save(buf)
        r = self.t.post('/api/studio/import/listening/', {'file': SimpleUploadedFile('t.docx', buf.getvalue())}, format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        p1, p2 = r.data['parts'][0], r.data['parts'][1]
        self.assertIn('1 Jenkins', p1['answers'])
        self.assertIn('11 C', p2['answers'])
        self.assertIn('Who pays?', p2['questions'])
