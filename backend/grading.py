"""Shared answer checking for Listening and Reading."""


def _norm(s):
    return ' '.join(str(s or '').strip().lower().rstrip('.').split())


def check(user_answer, correct_answer):
    """correct_answer may hold alternatives separated by '|', e.g. 'brain|brains'."""
    accepted = [_norm(a) for a in str(correct_answer).split('|')]
    return _norm(user_answer) in accepted


def display(correct_answer):
    return str(correct_answer).replace('|', ' / ')
