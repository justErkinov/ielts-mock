from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    phone = models.CharField(max_length=20, blank=True)
    is_teacher = models.BooleanField(
        default=False,
        help_text="Teachers can log into /admin to add tests and view results, "
                   "but cannot manage users or site settings."
    )

    def __str__(self):
        return self.username
