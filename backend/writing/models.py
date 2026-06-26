from django.db import models
from django.conf import settings

class WritingTest(models.Model):
    title = models.CharField(max_length=200)
    task1_image = models.ImageField(
        upload_to='writing/task1/', blank=True, null=True
    )  # Graf, jadval rasmi
    task1_question = models.TextField()
    task2_question = models.TextField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='writing_tests_created'
    )

    def __str__(self):
        return self.title

class WritingAttempt(models.Model):
    user = models.ForeignKey('users.User', on_delete=models.CASCADE)
    test = models.ForeignKey(WritingTest, on_delete=models.CASCADE)
    task1_text = models.TextField()
    task2_text = models.TextField()
    # Ustoz ball qo'yadi
    teacher_score = models.FloatField(blank=True, null=True)
    teacher_feedback = models.TextField(blank=True)
    # Keyinchalik AI ball
    # ai_score = models.FloatField(blank=True, null=True)
    # ai_feedback = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']