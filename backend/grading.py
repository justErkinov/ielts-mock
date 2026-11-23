"""Shared answer checking for Listening and Reading."""


def _norm(s):
    return ' '.join(str(s or '').strip().lower().rstrip('.').split())


def check(user_answer, correct_answer):
    """correct_answer may hold alternatives separated by '|', e.g. 'brain|brains'."""
    accepted = [_norm(a) for a in str(correct_answer).split('|')]
    return _norm(user_answer) in accepted


def display(correct_answer):
    return str(correct_answer).replace('|', ' / ')


class PairGuard:
    """'Choose TWO letters' questions share one answer list (e.g. both 21 and 22 accept
    'B|D'). The same letter given twice must earn only one mark."""

    def __init__(self):
        self.used = set()

    def check(self, user_answer, correct_answer, question_type=''):
        ok = check(user_answer, correct_answer)
        if ok and question_type == 'mcq' and '|' in str(correct_answer):
            key = (_norm(correct_answer), _norm(user_answer))
            if key in self.used:
                return False
            self.used.add(key)
        return ok
