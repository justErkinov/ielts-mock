"""Small helpers shared by the Listening / Reading / Writing views."""
from datetime import timedelta

from django.utils import timezone

DUPLICATE_WINDOW = timedelta(minutes=30)


def is_staff_user(user):
    return bool(user and user.is_authenticated and (user.is_superuser or getattr(user, 'is_teacher', False)))


def can_open(test, user):
    """Students see published tests; a teacher also sees their own drafts (preview)."""
    if test.is_active or user.is_superuser:
        return True
    return getattr(user, 'is_teacher', False) and test.created_by_id == user.id


def clean_answers(raw):
    """{'1': 'answer', ...} with short string values; anything else -> None (bad request)."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        return None
    out = {}
    for k, v in raw.items():
        if not str(k).isdigit() or isinstance(v, (dict, list)):
            continue
        out[str(int(k))] = '' if v is None else str(v)[:300]
    return out


def recent_duplicate(model, user, test, **same):
    """The same submission sent again (e.g. the browser retried after a network drop)
    returns the earlier attempt instead of creating a second one + a second Telegram message."""
    since = timezone.now() - DUPLICATE_WINDOW
    for a in model.objects.filter(user=user, test=test, submitted_at__gte=since).order_by('-submitted_at')[:5]:
        if all(getattr(a, k) == v for k, v in same.items()):
            return a
    return None
