import uuid
from django.conf import settings
from django.db import models


class MediaFile(models.Model):
    """An uploaded audio/image kept in the database (used when Cloudinary is not set up).
    Render's own disk is wiped on every deploy, so files must not live there.
    Files arrive in 2 MB pieces (MediaChunk) so slow connections never time out."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    data = models.BinaryField(blank=True, default=b'')   # older single-piece uploads
    complete = models.BooleanField(default=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class MediaChunk(models.Model):
    file = models.ForeignKey(MediaFile, on_delete=models.CASCADE, related_name='chunks')
    index = models.PositiveIntegerField()
    data = models.BinaryField()

    class Meta:
        ordering = ['index']
        unique_together = [('file', 'index')]
