import requests
from django.conf import settings
from django.utils import timezone


def _split(text, size=3900):
    """Telegram allows 4096 characters per message: cut long texts at paragraph
    or word boundaries so nothing is lost."""
    parts = []
    while len(text) > size:
        cut = text.rfind('\n', 0, size)
        if cut < size // 2:
            cut = text.rfind(' ', 0, size)
        if cut < size // 2:
            cut = size
        parts.append(text[:cut].rstrip())
        text = text[cut:].lstrip()
    if text:
        parts.append(text)
    return parts


def _send(text, *more):
    """Sends in a background thread with retries, so a slow or failing
    Telegram API never blocks the student's request.
    `text` uses Markdown; if Telegram rejects it, it is re-sent as plain text.
    `more` are extra plain-text messages (e.g. full essays) sent after it, in order."""
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        print("Telegram credentials not configured!")
        return

    messages = [(text[:4096], True)]
    for m in more:
        messages += [(p, False) for p in _split(m)]

    def deliver(body, markdown):
        import time
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {"chat_id": chat_id, "text": body}
        if markdown:
            payload["parse_mode"] = "Markdown"
        for attempt in range(5):
            try:
                r = requests.post(url, json=payload, timeout=(10, 30))
                if r.ok:
                    return
                print(f"Telegram API {r.status_code} (attempt {attempt + 1}/5): {r.text[:200]}")
                if r.status_code == 400 and "parse_mode" in payload:
                    payload.pop("parse_mode")
                    continue
            except Exception as e:
                print(f"Telegram error (attempt {attempt + 1}/5): {e}")
            time.sleep(5 * (attempt + 1))

    def worker():
        for body, markdown in messages:
            deliver(body, markdown)

    import threading
    threading.Thread(target=worker, daemon=True).start()


def _tashkent(dt=None, with_seconds=False):
    """Converts any datetime to Tashkent time (settings.TIME_ZONE)."""
    if dt is None or timezone.is_naive(dt):
        dt = timezone.now()
    fmt = '%d %b %Y, %H:%M:%S' if with_seconds else '%d %b %Y, %H:%M'
    return timezone.localtime(dt).strftime(fmt)


def _band(pct):
    return (9.0 if pct >= 90 else 8.0 if pct >= 80 else 7.0 if pct >= 70
            else 6.0 if pct >= 60 else 5.0 if pct >= 50 else 4.0 if pct >= 40 else 3.0)


# Official IELTS raw-score -> band conversion (out of 40)
_LISTENING_40 = [(39, 9.0), (37, 8.5), (35, 8.0), (32, 7.5), (30, 7.0), (26, 6.5), (23, 6.0),
                 (18, 5.5), (16, 5.0), (13, 4.5), (10, 4.0), (8, 3.5), (6, 3.0), (4, 2.5)]
_READING_40 = [(39, 9.0), (37, 8.5), (35, 8.0), (33, 7.5), (30, 7.0), (27, 6.5), (23, 6.0),
               (19, 5.5), (15, 5.0), (13, 4.5), (10, 4.0), (8, 3.5), (6, 3.0), (4, 2.5)]


def _band40(score, total, table):
    """Official table for a full 40-question test; % estimate otherwise."""
    if total != 40:
        return _band(round(score / total * 100) if total else 0)
    for minimum, band in table:
        if score >= minimum:
            return band
    return 2.0 if score >= 2 else 1.0 if score >= 1 else 0.0


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
        f"🎯 Band: *{_band40(attempt.score, total_q, _READING_40):.1f}*"
        f"{_time_block(time_info, total_q, pct)}"
    )


def notify_listening_group(user, part_scores, score, total, time_info=None):
    pct = round(score / total * 100) if total else 0
    parts = "\n".join(f"   • {title.split(',')[-1].strip()}: {s} / {n}" for title, s, n in part_scores)
    base = part_scores[0][0].rsplit(',', 1)[0] if part_scores else ''
    _send(
        f"🎧 *LISTENING RESULT*\n\n"
        f"👤 Student: {user.get_full_name() or user.username}\n"
        f"📅 Date: {_tashkent()}\n"
        f"📝 Test: {base}\n\n"
        f"✅ Score: *{score} / {total}*\n"
        f"{parts}\n"
        f"📊 Accuracy: *{pct}%*\n"
        f"🎯 Band: *{_band40(score, total, _LISTENING_40):.1f}*"
        f"{_time_block(time_info, total, pct)}"
    )


def notify_writing(user, attempt, time_info=None):
    """A summary message, then each task's FULL text in its own message(s)."""
    def summary(label, text, min_words):
        words = len(text.split())
        if not text:
            return f"📌 *{label}* — ⚠️ *NOT WRITTEN (0 words)*"
        short = f" ⚠️ under {min_words}" if words < min_words else ""
        return f"📌 *{label}*: {words} words{short}"

    task_times = ""
    if time_info:
        tt1 = _int(time_info.get('task1_time'))
        tt2 = _int(time_info.get('task2_time'))
        if tt1 is not None or tt2 is not None:
            task_times = (f"\n🕐 Task 1 time: {_fmt_duration(tt1)} (recommended 20 min)"
                          f"\n🕐 Task 2 time: {_fmt_duration(tt2)} (recommended 40 min)")

    name = user.get_full_name() or user.username
    t1, t2 = attempt.task1_text or '', attempt.task2_text or ''
    essays = []
    for label, text in (('Task 1', t1), ('Task 2', t2)):
        if text:
            essays.append(f"{label} — {name} ({len(text.split())} words)\n\n{text}")
    _send(
        f"✍️ *WRITING SUBMISSION*\n\n"
        f"👤 Student: {name}\n"
        f"📅 Date: {_tashkent(attempt.submitted_at)}\n"
        f"📝 Test: {attempt.test.title}"
        f"{_time_block(time_info)}"
        f"{task_times}\n\n"
        f"{summary('Task 1', t1, 150)}\n"
        f"{summary('Task 2', t2, 250)}\n\n"
        f"⏳ _Full texts follow below. Awaiting teacher review_",
        *essays,
    )


REASON_LABELS = {
    'tab_switch': 'Switched browser tab / app',
    'window_blur': 'Left the window (Alt+Tab or similar)',
    'fullscreen_exit': 'Exited fullscreen mode',
    'right_click': 'Right-clicked (context menu / Search with Google)',
    'copy_attempt': 'Tried to copy/cut exam content',
    'warning_ignored': 'Did not return to the test within 5 seconds',
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
