"""Saving teacher uploads somewhere that survives Render redeploys."""
import hashlib
import re
import time
from urllib.parse import urlparse

import requests
from django.conf import settings

from .models import MediaFile

ALLOWED = ('audio/', 'image/')


def _safe_name(name):
    base = re.sub(r'[^A-Za-z0-9._-]+', '-', name or 'file').strip('-')
    return base[-80:] or 'file'


def cloudinary_ready():
    return settings.CLOUDINARY_URL.startswith('cloudinary://')


def _cloudinary_upload(f, folder='ielts-mock'):
    u = urlparse(settings.CLOUDINARY_URL)   # cloudinary://API_KEY:API_SECRET@CLOUD_NAME
    api_key, api_secret, cloud = u.username, u.password, u.hostname
    ts = str(int(time.time()))
    signature = hashlib.sha1(f'folder={folder}&timestamp={ts}{api_secret}'.encode()).hexdigest()
    # audio is a "video" resource on Cloudinary; "auto" picks the right one
    r = requests.post(
        f'https://api.cloudinary.com/v1_1/{cloud}/auto/upload',
        data={'api_key': api_key, 'timestamp': ts, 'folder': folder, 'signature': signature},
        files={'file': (_safe_name(f.name), f, f.content_type)},
        timeout=300,
    )
    r.raise_for_status()
    return r.json()['secure_url']


def save_upload(f, user, request):
    """Returns (url, where). Raises ValueError with a message for the teacher."""
    ctype = (getattr(f, 'content_type', '') or '').lower()
    if not ctype.startswith(ALLOWED):
        raise ValueError('Only audio (mp3, m4a, wav) and image (jpg, png) files can be uploaded.')
    if f.size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise ValueError(f'The file is too big ({f.size // (1024 * 1024)} MB). '
                         f'The limit is {settings.MAX_UPLOAD_MB} MB.')
    if cloudinary_ready():
        return _cloudinary_upload(f), 'cloudinary'
    m = MediaFile.objects.create(name=_safe_name(f.name), content_type=ctype, size=f.size,
                                 data=f.read(), uploaded_by=user)
    return request.build_absolute_uri(f'/api/studio/media/{m.id}/{m.name}'), 'database'
