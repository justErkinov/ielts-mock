import requests
from django.conf import settings
from django.utils import timezone


def _send(text):
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        print("Telegram credentials not configured!")
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=5
        )
    except Exception as e:
        print(f"Telegram error: {e}")


def _tashkent(dt=None, with_seconds=False):
    """Converts any datetime to Tashkent time (settings.TIME_ZONE)."""
    if dt is None or timezone.is_naive(dt):
        dt = timezone.now()
    fmt = '%d %b %Y, %H:%M:%S' if with_seconds else '%d %b %Y, %H:%M'
    return timezone.localtime(dt).strftime(fmt)


def _band(pct):
    return (9.0 if pct >= 90 else 8.0 if pct >= 80 else 7.0 if pct >= 70
            else 6.0 if pct >= 60 else 5.0 if pct >= 50 else 4.0 if pct >= 40 else 3.0)


def _int(value):
    """Safely read a number sent by the frontend; returns None if missing/invalid."""
    try:
        n = int(float(value))
        return n if n >= 0 else None
    except (TypeError, ValueError):
        return None


def _fmt_duration(secs):
    if secs is None:
        return "—"
    m, s = divmod(int(secs), 60)
    if m == 0:
        return f"{s} sec"
    return f"{m} min {s} sec"


def _time_block(time_info, n_questions=None, pct=None):
    """
    Builds the timing section of a result message.
    Tells the teacher how long the student took and whether they rushed,
    ran out of time, or were locked out.
    """
    if not time_info:
        return ""

    spent = _int(time_info.get('time_spent'))
    limit = _int(time_info.get('time_limit'))
    reason = time_info.get('finish_reason') or 'manual'

    if spent is None:
        return ""

    lines = [f"\n⏱️ Time spent: *{_fmt_duration(spent)}*"
             + (f" (limit {limit // 60} min)" if limit else "")]

    if n_questions:
        lines.append(f"⚡ Avg per question: {_fmt_duration(spent / n_questions)}")

    if reason == 'blocked':
        status = "🚫 Locked — anti-cheat violations"
    elif reason == 'timeout':
        status = "🔴 Timeout — time ran out, auto-submitted"
    elif limit:
        ratio = spent / limit
        remaining = limit - spent
        if ratio < 0.4:
            status = "⚡ Very fast"
        elif remaining <= 300:
            status = "⚠️ Finished in the last 5 min"
        else:
            status = "✅ Finished early"
    else:
        status = "✅ Submitted"

    lines.append(f"📌 Status: {status}")

    # Flag possible guessing: very fast AND low score
    if reason == 'manual' and limit and pct is not None:
        if spent / limit < 0.4 and pct < 50:
            lines.append("🎲 _Possible guessing — very fast with a low score_")

    return "\n".join(lines)


def notify_listening(user, attempt, time_info=None):
    total = attempt.test.questions.count()
    pct = round((attempt.score / total) * 100) if total else 0
    _send(
        f"🎧 *LISTENING RESULT*\n\n"
        f"👤 Student: {user.get_full_name() or user.username}\n"
        f"📅 Date: {_tashkent(attempt.submitted_at)}\n"
        f"📝 Test: {attempt.test.title}\n\n"
        f"✅ Score: *{attempt.score} / {total}*\n"
        f"📊 Accuracy: *{pct}%*\n"
        f"🎯 Est. Band: *{_band(pct):.1f}*"
        f"{_time_block(time_info, total, pct)}"
    )


def notify_reading(user, attempt, time_info=None):
    try:
        total_q = sum(p.questions.count() for p in attempt.test.passages.all())
    except Exception:
        total_q = 40
    pct = round((attempt.score / total_q) * 100) if total_q else 0
    _send(
        f"📖 *READING RESULT*\n\n"
        f"👤 Student: {user.get_full_name() or user.username}\n"
        f"📅 Date: {_tashkent(attempt.submitted_at)}\n"
        f"📝 Test: {attempt.test.title}\n\n"
        f"✅ Score: *{attempt.score} / {total_q}*\n"
        f"📊 Accuracy: *{pct}%*\n"
        f"🎯 Est. Band: *{_band(pct):.1f}*"
        f"{_time_block(time_info, total_q, pct)}"
    )


def notify_writing(user, attempt, time_info=None):
    t1 = (attempt.task1_text[:700] + '...') if len(attempt.task1_text) > 700 else attempt.task1_text
    t2 = (attempt.task2_text[:900] + '...') if len(attempt.task2_text) > 900 else attempt.task2_text
    w1 = len(attempt.task1_text.split())
    w2 = len(attempt.task2_text.split())

    task_times = ""
    if time_info:
        tt1 = _int(time_info.get('task1_time'))
        tt2 = _int(time_info.get('task2_time'))
        if tt1 is not None or tt2 is not None:
            task_times = (f"\n🕐 Task 1 time: {_fmt_duration(tt1)} (of 20 min)"
                          f"\n🕐 Task 2 time: {_fmt_duration(tt2)} (of 40 min)")

    _send(
        f"✍️ *WRITING SUBMISSION*\n\n"
        f"👤 Student: {user.get_full_name() or user.username}\n"
        f"📅 Date: {_tashkent(attempt.submitted_at)}\n"
        f"📝 Test: {attempt.test.title}"
        f"{_time_block(time_info)}"
        f"{task_times}\n\n"
        f"📌 *Task 1* ({w1} words):\n{t1}\n\n"
        f"📌 *Task 2* ({w2} words):\n{t2}\n\n"
        f"⏳ _Awaiting teacher review_"
    )


REASON_LABELS = {
    'tab_switch': 'Switched browser tab / app',
    'window_blur': 'Left the window (Alt+Tab or similar)',
    'fullscreen_exit': 'Exited fullscreen mode',
    'right_click': 'Right-clicked (context menu / Search with Google)',
    'copy_attempt': 'Tried to copy/cut exam content',
    'devtools_attempt': 'Tried to open DevTools / print / save page',
}


def notify_violation(user, test_type, test_id, reason, count, when=None):
    label = REASON_LABELS.get(reason, reason)
    severity = "🔴 FINAL — TEST AUTO-SUBMITTED & LOCKED" if count >= 3 else f"🟡 Warning {count}/3"
    _send(
        f"⚠️ *VIOLATION DETECTED*\n\n"
        f"👤 Student: {user.get_full_name() or user.username}\n"
        f"🕒 Time: {_tashkent(when, with_seconds=True)}\n"
        f"📝 Test: {test_type.capitalize()} (#{test_id})\n"
        f"❗ Action: {label}\n"
        f"📊 Status: {severity}"
    )
