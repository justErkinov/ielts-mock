import requests
from django.conf import settings


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


def notify_listening(user, attempt):
    total = attempt.test.questions.count()
    pct = round((attempt.score / total) * 100) if total else 0
    band = (9.0 if pct >= 90 else 8.0 if pct >= 80 else 7.0 if pct >= 70
            else 6.0 if pct >= 60 else 5.0 if pct >= 50 else 4.0 if pct >= 40 else 3.0)
    _send(
        f"🎧 *LISTENING RESULT*\n\n"
        f"👤 Student: {user.get_full_name() or user.username}\n"
        f"📅 Date: {attempt.submitted_at.strftime('%d %b %Y, %H:%M')}\n"
        f"📝 Test: {attempt.test.title}\n\n"
        f"✅ Score: *{attempt.score} / {total}*\n"
        f"📊 Accuracy: *{pct}%*\n"
        f"🎯 Est. Band: *{band:.1f}*"
    )


def notify_reading(user, attempt):
    total = attempt.score  # fallback
    # try to get real total
    try:
        total_q = sum(p.questions.count() for p in attempt.test.passages.all())
    except Exception:
        total_q = 40
    pct = round((attempt.score / total_q) * 100) if total_q else 0
    band = (9.0 if pct >= 90 else 8.0 if pct >= 80 else 7.0 if pct >= 70
            else 6.0 if pct >= 60 else 5.0 if pct >= 50 else 4.0 if pct >= 40 else 3.0)
    _send(
        f"📖 *READING RESULT*\n\n"
        f"👤 Student: {user.get_full_name() or user.username}\n"
        f"📅 Date: {attempt.submitted_at.strftime('%d %b %Y, %H:%M')}\n"
        f"📝 Test: {attempt.test.title}\n\n"
        f"✅ Score: *{attempt.score} / {total_q}*\n"
        f"📊 Accuracy: *{pct}%*\n"
        f"🎯 Est. Band: *{band:.1f}*"
    )


def notify_writing(user, attempt):
    t1 = (attempt.task1_text[:700] + '...') if len(attempt.task1_text) > 700 else attempt.task1_text
    t2 = (attempt.task2_text[:900] + '...') if len(attempt.task2_text) > 900 else attempt.task2_text
    w1 = len(attempt.task1_text.split())
    w2 = len(attempt.task2_text.split())
    _send(
        f"✍️ *WRITING SUBMISSION*\n\n"
        f"👤 Student: {user.get_full_name() or user.username}\n"
        f"📅 Date: {attempt.submitted_at.strftime('%d %b %Y, %H:%M')}\n"
        f"📝 Test: {attempt.test.title}\n\n"
        f"📌 *Task 1* ({w1} words):\n{t1}\n\n"
        f"📌 *Task 2* ({w2} words):\n{t2}\n\n"
        f"⏳ _Awaiting teacher review_"
        # Future: f"🤖 AI Band: {attempt.ai_score}"
    )


REASON_LABELS = {
    'tab_switch': 'Switched browser tab / app',
    'window_blur': 'Left the window (Alt+Tab or similar)',
    'fullscreen_exit': 'Exited fullscreen mode',
    'right_click': 'Right-clicked (context menu / Search with Google)',
    'copy_attempt': 'Tried to copy/cut exam content',
    'devtools_attempt': 'Tried to open DevTools / print / save page',
}


def notify_violation(user, test_type, test_id, reason, count, when):
    label = REASON_LABELS.get(reason, reason)
    severity = "🔴 FINAL — TEST AUTO-SUBMITTED & LOCKED" if count >= 3 else f"🟡 Warning {count}/3"
    _send(
        f"⚠️ *VIOLATION DETECTED*\n\n"
        f"👤 Student: {user.get_full_name() or user.username}\n"
        f"🕒 Time: {when.strftime('%d %b %Y, %H:%M:%S')}\n"
        f"📝 Test: {test_type.capitalize()} (#{test_id})\n"
        f"❗ Action: {label}\n"
        f"📊 Status: {severity}"
    )
