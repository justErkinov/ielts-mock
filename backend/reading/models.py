from django.db import models
from django.conf import settings

class ReadingTest(models.Model):
    title = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reading_tests_created'
    )

    def __str__(self):
        return self.title

class ReadingPassage(models.Model):
    """Har bir testda 3 ta passage bo'ladi"""
    test = models.ForeignKey(
        ReadingTest, on_delete=models.CASCADE, related_name='passages'
    )
    passage_number = models.PositiveIntegerField()  # 1, 2, 3
    title = models.CharField(max_length=200)
    text = models.TextField()

    class Meta:
        ordering = ['passage_number']

class ReadingQuestion(models.Model):
    TYPES = [
        ('tfng', 'True/False/Not Given'),
        ('mcq', 'Multiple Choice'),
        ('matching', 'Matching Headings'),
        ('gap_fill', 'Gap Fill'),
    ]
    passage = models.ForeignKey(
        ReadingPassage, on_delete=models.CASCADE, related_name='questions'
    )
    question_type = models.CharField(max_length=20, choices=TYPES)
    question_number = models.PositiveIntegerField()  # 1-40
    question_text = models.TextField()
    options = models.JSONField(blank=True, null=True)
    correct_answer = models.CharField(max_length=300)

    class Meta:
        ordering = ['question_number']

class ReadingAttempt(models.Model):
    user = models.ForeignKey('users.User', on_delete=models.CASCADE)
    test = models.ForeignKey(ReadingTest, on_delete=models.CASCADE)
    answers = models.JSONField()
    score = models.PositiveIntegerField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']