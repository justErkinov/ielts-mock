"""The pasted-text format teachers use in the studio."""
import importlib.util
import os

from django.test import SimpleTestCase

from studio.textformat import parse, parse_answers, to_text

LISTENING = """PART 1
Questions 1-4
Complete the notes below.
Write ONE WORD AND/OR A NUMBER for each answer.
Hotel booking
• Name: Sarah 1 ……
• Price per night: £ 2 ……
• shows you how to
3
…… and cook
• costs (4) …… a week

Questions 5-6
Choose the correct letter, A, B or C.
5 Why are changes needed to traffic systems in
Granford?
A The number of accidents has risen.
B The amount of traffic has increased.
C The types of vehicles have changed.
6 Who pays?
(A) parents
(B) the school
(C) the city

Questions 7 and 8
Choose TWO letters, A-E.
Which TWO problems are mentioned?
A cost
B noise
C traffic
D space
E time

Questions 9-10
Complete the flow-chart below. Choose answers from the box.
9 Select seeds of different ……… and sizes.
10 Measure the ……… of each one.
A container
B soil
C weight
"""
ANSWERS = "1 Jenkins 2 85 3 cook\nQ4 20 / twenty\n5 B\n6 c\n7-8 B, D (in either order)\n9 C\n10 C"


class ListeningFormatTests(SimpleTestCase):
    def setUp(self):
        self.r = parse('listening', LISTENING, ANSWERS, 1, 10)
        self.q = {q['question_number']: q for q in self.r['questions']}

    def test_everything_found_without_errors(self):
        self.assertEqual(self.r['errors'], [])
        self.assertEqual(sorted(self.q), list(range(1, 11)))

    def test_gaps(self):
        self.assertEqual(self.q[1]['question_type'], 'gap_fill')
        self.assertIn('___', self.q[1]['question_text'])
        self.assertIn('Hotel booking', self.q[1]['question_text'])       # heading kept above
        self.assertIn('shows you how to', self.q[3]['question_text'])     # number on its own line
        self.assertEqual(self.q[4]['correct_answer'], '20|twenty')        # (4) numbering, alternatives

    def test_choice_and_wrapped_stem(self):
        self.assertIn('Granford?', self.q[5]['question_text'])
        self.assertEqual(self.q[5]['correct_answer'], 'The amount of traffic has increased.')
        self.assertEqual(self.q[6]['correct_answer'], 'the city')

    def test_choose_two_and_box_after_questions(self):
        self.assertEqual(self.q[7]['correct_answer'], 'noise|space')
        self.assertEqual(self.q[8]['options'], ['cost', 'noise', 'traffic', 'space', 'time'])
        self.assertEqual(self.q[9]['options'], ['container', 'soil', 'weight'])
        self.assertEqual(self.q[10]['correct_answer'], 'weight')

    def test_missing_answer_and_missing_question_are_errors(self):
        r = parse('listening', LISTENING, '1 x', 1, 10)
        self.assertTrue(any('no answer' in e for e in r['errors']))
        r = parse('listening', 'Questions 1-3\nComplete.\n1 a ……\n2 b ……', '1 x\n2 y\n3 z')
        self.assertTrue(any('3 not found' in e for e in r['errors']))
        r = parse('listening', 'Questions 1-2\nComplete.\nno numbers here', '1 x')
        self.assertTrue(any('no questions were found' in e for e in r['errors']))


READING = """Questions 1-2
Do the following statements agree with the information given in Reading Passage 1?
Write TRUE, FALSE or NOT GIVEN.
1 The bridge is old.
2 The bridge is red.
Questions 3-4
Do the following statements agree with the claims of the writer?
Write YES, NO or NOT GIVEN.
3 Tourism is good.
4 Prices will rise.
Questions 5-6
Choose the correct heading for each paragraph from the list of headings below.
List of Headings
i A difficult beginning
ii Plans for the future
iii Why tourists come
5 Paragraph A
6 Paragraph B
Questions 7-8
Match each statement with the correct person, A-C.
7 Said tourism helps
8 Built the bridge
List of People
A Tom Smith
B Anna Lee
C Bill Ray
"""


class ReadingFormatTests(SimpleTestCase):
    def test_all_reading_types(self):
        r = parse('reading', READING, '1 T\n2 NG\n3 n\n4 YES\n5 iii\n6 i\n7 B\n8 C')
        self.assertEqual(r['errors'], [])
        q = {x['question_number']: x for x in r['questions']}
        self.assertEqual((q[1]['question_type'], q[1]['correct_answer']), ('tfng', 'TRUE'))
        self.assertEqual(q[2]['correct_answer'], 'NOT GIVEN')
        self.assertEqual((q[3]['options'], q[3]['correct_answer']), (['YES', 'NO', 'NOT GIVEN'], 'NO'))
        self.assertEqual(q[5]['correct_answer'], 'iii. Why tourists come')
        self.assertIn('[box:List of Headings]', q[5]['group_instruction'])
        self.assertEqual(q[7]['correct_answer'], 'Anna Lee')
        self.assertNotIn('List of People', q[8]['question_text'])

    def test_bad_tfng_answer_is_reported(self):
        r = parse('reading', READING, '1 maybe')
        self.assertTrue(any('TRUE, FALSE or NOT GIVEN' in e for e in r['errors']))


class AnswerKeyTests(SimpleTestCase):
    def test_several_on_one_line_split_only_at_the_next_number(self):
        a = parse_answers('1 choose 2 private 3 20 / twenty')
        self.assertEqual(a[3]['raw'], '20 / twenty')
        self.assertEqual(a[2]['raw'], 'private')


class RoundTripTests(SimpleTestCase):
    """Saved tests turn back into text for editing without losing anything."""

    def test_cambridge_13(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'users', 'management', 'commands', 'load_cambridge13.py')
        spec = importlib.util.spec_from_file_location('lc13', path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        def norm(a):
            return '|'.join(sorted(x.strip().lower() for x in (a or '').split('|')))

        for qs in mod.LISTENING.values():
            orig = [dict(question_number=n, question_type=t, group_title=gt, group_instruction=gi,
                         question_text=tx, options=o, correct_answer=a) for n, t, gt, gi, tx, o, a in qs]
            back = parse('listening', *to_text('listening', orig))
            self.assertEqual(back['errors'], [])
            for o, b in zip(orig, back['questions']):
                self.assertEqual((o['question_number'], norm(o['correct_answer']), o['options'] or None),
                                 (b['question_number'], norm(b['correct_answer']), b['options'] or None))
        for qs in mod.READING_QUESTIONS.values():
            orig = [dict(question_number=n, question_type=t, question_text=tx, options=o, correct_answer=a)
                    for n, t, tx, o, a in qs]
            back = parse('reading', *to_text('reading', orig))
            self.assertEqual(back['errors'], [])
            self.assertEqual([norm(o['correct_answer']) for o in orig], [norm(b['correct_answer']) for b in back['questions']])
