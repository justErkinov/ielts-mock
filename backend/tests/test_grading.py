"""How answers are compared and shown to the student."""
from types import SimpleNamespace as Q

from django.test import SimpleTestCase

from grading import check, show, review, PairGuard


class CompareTests(SimpleTestCase):
    def test_examiner_style_equality(self):
        self.assertTrue(check('  Jenkins ', 'jenkins'))
        self.assertTrue(check('£85', '85'))
        self.assertTrue(check('£ 85', '85'))
        self.assertTrue(check('1,000', '1000'))
        self.assertTrue(check('1000', '1,000'))
        self.assertTrue(check('it’s', "it's"))
        self.assertTrue(check('river.', 'river'))
        self.assertTrue(check('the honey', 'honey|the honey'))

    def test_real_mistakes_stay_wrong(self):
        self.assertFalse(check('Jenkin', 'Jenkins'))
        self.assertFalse(check('100', '1000'))
        self.assertFalse(check('', 'x'))
        self.assertFalse(check('A', 'e'))

    def test_choose_two_same_letter_counts_once(self):
        g = PairGuard()
        self.assertTrue(g.check('noise', 'noise|space', 'mcq'))
        self.assertFalse(g.check('noise', 'noise|space', 'mcq'))
        self.assertTrue(g.check('space', 'noise|space', 'mcq'))


class ShowTests(SimpleTestCase):
    opts = ['cost', 'noise', 'traffic']

    def test_options_get_their_letter(self):
        q = Q(options=self.opts, correct_answer='noise')
        self.assertEqual(show(q, 'noise'), 'B. noise')
        self.assertEqual(show(q, 'noise|traffic'), 'B. noise / C. traffic')

    def test_fixed_words_headings_and_map_letters(self):
        self.assertEqual(show(Q(options=['TRUE', 'FALSE', 'NOT GIVEN']), 'TRUE'), 'TRUE')
        self.assertEqual(show(Q(options=['i. Start', 'ii. End']), 'ii. End'), 'ii. End')
        self.assertEqual(show(Q(options=None), 'e'), 'E')
        self.assertEqual(show(Q(options=None), ''), '')

    def test_review_explains_repeated_pair_answer(self):
        q = Q(options=self.opts, correct_answer='noise|traffic')
        r = review(q, 'noise', False)
        self.assertIn('C. traffic', r['correct_answer'])
        self.assertIn('already counted', r['correct_answer'])
