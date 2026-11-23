"""Saving teacher uploads somewhere that survives Render redeploys.

Uploads arrive in CHUNK_SIZE pieces (start -> chunk x N -> finish), so a slow
connection never hits a request timeout and a failed piece is simply re-sent.
With CLOUDINARY_URL set, the finished file is sent on to Cloudinary (a CDN that
serves audio to many students at once); otherwise it stays in the database."""
import hashlib
import io
import re
import time
from urllib.parse import urlparse

import requests
from django.conf import settings

from .models import MediaFile, MediaChunk

CHUNK_SIZE = 2 * 1024 * 1024
ALLOWED = ('audio/', 'image/')
EXT_TYPES = {'mp3': 'audio/mpeg', 'm4a': 'audio/mp4', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
             'aac': 'audio/aac', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
             'gif': 'image/gif', 'webp': 'image/webp'}


def _safe_name(name):
    base = re.sub(r'[^A-Za-z0-9._-]+', '-', name or 'file').strip('-')
    return base[-80:] or 'file'


def guess_type(name, ctype):
    """Some browsers send an empty or generic type (e.g. for .m4a): use the extension."""
    ctype = (ctype or '').lower()
    if ctype.startswith(ALLOWED):
        return ctype
    ext = (name or '').rsplit('.', 1)[-1].lower()
    return EXT_TYPES.get(ext, ctype)


def validate(name, ctype, size):
    if not guess_type(name, ctype).startswith(ALLOWED):
        raise ValueError('Only audio (mp3, m4a, wav) and pictures (jpg, png) can be uploaded.')
    if size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise ValueError(f'The file is too big ({size // (1024 * 1024)} MB). '
                         f'The limit is {settings.MAX_UPLOAD_MB} MB.')
    if size <= 0:
        raise ValueError('The file is empty.')


def cloudinary_ready():
    return settings.CLOUDINARY_URL.startswith('cloudinary://')


def _cloudinary_upload(name, ctype, data, folder='ielts-mock'):
    u = urlparse(settings.CLOUDINARY_URL)   # cloudinary://API_KEY:API_SECRET@CLOUD_NAME
    api_key, api_secret, cloud = u.username, u.password, u.hostname
    ts = str(int(time.time()))
    signature = hashlib.sha1(f'folder={folder}&timestamp={ts}{api_secret}'.encode()).hexdigest()
    # audio is a "video" resource on Cloudinary; "auto" picks the right one
    r = requests.post(
        f'https://api.cloudinary.com/v1_1/{cloud}/auto/upload',
        data={'api_key': api_key, 'timestamp': ts, 'folder': folder, 'signature': signature},
        files={'file': (_safe_name(name), io.BytesIO(data), ctype)},
        timeout=280,
    )
    r.raise_for_status()
    return r.json()['secure_url']


def start(name, ctype, size, user):
    validate(name, ctype, size)
    # tidy up uploads that were started but never finished (closed tab etc.)
    from datetime import timedelta
    from django.utils import timezone
    MediaFile.objects.filter(complete=False, created_at__lt=timezone.now() - timedelta(days=1)).delete()
    return MediaFile.objects.create(name=_safe_name(name), content_type=guess_type(name, ctype),
                                    size=size, complete=False, uploaded_by=user)


def put_chunk(m, index, data):
    if m.complete:
        raise ValueError('This upload is already finished.')
    if len(data) > CHUNK_SIZE or index * CHUNK_SIZE >= m.size:
        raise ValueError('Unexpected file piece.')
    MediaChunk.objects.update_or_create(file=m, index=index, defaults={'data': data})


def finish(m, request):
    """Checks every piece arrived, then returns the public URL."""
    expected = (m.size + CHUNK_SIZE - 1) // CHUNK_SIZE
    have = list(m.chunks.order_by('index').values_list('index', flat=True))
    if have != list(range(expected)):
        missing = sorted(set(range(expected)) - set(have))
        raise ValueError(f'{len(missing)} piece(s) of the file did not arrive. Please upload it again.')
    got = sum(len(bytes(c)) for c in m.chunks.values_list('data', flat=True))
    if got != m.size:
        raise ValueError('The file did not arrive completely. Please upload it again.')
    if cloudinary_ready():
        data = b''.join(bytes(c) for c in m.chunks.order_by('index').values_list('data', flat=True))
        url = _cloudinary_upload(m.name, m.content_type, data)
        m.delete()
        return url, 'cloudinary'
    m.complete = True
    m.save(update_fields=['complete'])
    return request.build_absolute_uri(f'/api/studio/media/{m.id}/{m.name}'), 'database'


def save_upload(f, user, request):
    """Single-request upload (small files / older clients)."""
    m = start(f.name, getattr(f, 'content_type', ''), f.size, user)
    for i, piece in enumerate(iter(lambda: f.read(CHUNK_SIZE), b'')):
        put_chunk(m, i, piece)
    return finish(m, request)
