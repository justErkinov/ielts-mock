"""Shared answer checking for Listening and Reading."""


import re

_QUOTES = str.maketrans({'‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-'})


def _norm(s):
    """Compare answers the way an examiner would: case, extra spaces, a final full stop,
    curly quotes, a currency sign before a number and thousands commas don't matter."""
    s = str(s or '').translate(_QUOTES).strip().lower().rstrip('.')
    s = re.sub(r'[£$€]\s*(?=\d)', '', s)            # £85 -> 85
    s = re.sub(r'(?<=\d),(?=\d{3}\b)', '', s)         # 1,000 -> 1000
    return ' '.join(s.split())


def check(user_answer, correct_answer):
    """correct_answer may hold alternatives separated by '|', e.g. 'brain|brains'."""
    accepted = [_norm(a) for a in str(correct_answer).split('|')]
    return _norm(user_answer) in accepted


def display(correct_answer):
    return str(correct_answer).replace('|', ' / ')


LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
FIXED = ({'TRUE', 'FALSE', 'NOT GIVEN'}, {'YES', 'NO', 'NOT GIVEN'})


def show(question, value):
    """An answer as the student saw it: options with their letter ("B. The amount of
    traffic ..."), headings with their numeral ("iv. ..."), anything else as written.
    Several accepted answers are joined with ' / '."""
    opts = question.options or []
    if not value:
        return ''
    out = []
    for v in str(value).split('|'):
        v = v.strip()
        if opts and set(opts) not in FIXED and v in opts and not re.match(r'^[ivx]+\.\s', v, re.I):
            out.append(f'{LETTERS[opts.index(v)]}. {v}')
        elif re.fullmatch(r'[a-z]', v, re.I):
            out.append(v.upper())          # map / plan letters: "e" -> "E"
        else:
            out.append(v)
    return ' / '.join(out)


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


def review(question, given, ok):
    """One line of the student's answer review."""
    correct = question.correct_answer
    shown = show(question, correct)
    if not ok and given and check(given, correct) and '|' in str(correct):
        # 'Choose TWO': the same letter was used twice -> say what the other answer was
        rest = '|'.join(a for a in str(correct).split('|') if _norm(a) != _norm(given))
        shown = f"{show(question, rest)} ({show(question, given).split('.')[0]} was already counted for the other question)"
    return {'your_answer': show(question, given), 'correct_answer': shown, 'is_correct': ok}
