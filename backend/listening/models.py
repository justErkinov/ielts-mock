from django.db import models
from django.conf import settings

class ListeningTest(models.Model):
    title = models.CharField(max_length=200)      # "IELTS Trainer 1, Test 1"
    audio_url = models.URLField()                  # audio fayl linki
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='listening_tests_created'
    )

    def __str__(self):
        return self.title

class ListeningQuestion(models.Model):
    TYPES = [
        ('gap_fill', 'Gap Fill'),
        ('mcq', 'Multiple Choice'),
        ('matching', 'Matching'),
    ]
    test = models.ForeignKey(
        ListeningTest, on_delete=models.CASCADE, related_name='questions'
    )
    question_type = models.CharField(max_length=20, choices=TYPES)
    question_number = models.PositiveIntegerField()  # 1-40
    question_text = models.TextField(
        help_text="For gap_fill inside notes, use ___ where the blank should appear."
    )
    options = models.JSONField(blank=True, null=True)  # MCQ uchun
    correct_answer = models.CharField(max_length=300)

    # Grouping fields — so multiple questions can share one instruction block
    group_title = models.CharField(
        max_length=200, blank=True,
        help_text="e.g. 'Questions 1-10' — same value groups questions together."
    )
    group_instruction = models.TextField(
        blank=True,
        help_text="e.g. 'Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer.'"
    )

    class Meta:
        ordering = ['question_number']

class ListeningAttempt(models.Model):
    user = models.ForeignKey('users.User', on_delete=models.CASCADE)
    test = models.ForeignKey(ListeningTest, on_delete=models.CASCADE)
    answers = models.JSONField()          # {"1": "B", "2": "table", ...}
    score = models.PositiveIntegerField() # 0-40
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']