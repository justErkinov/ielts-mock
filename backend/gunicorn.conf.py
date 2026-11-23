"""
Gunicorn settings (loaded automatically: gunicorn reads ./gunicorn.conf.py).

Defaults were 1 worker, 1 request at a time and a 30-second limit. During a mock
exam 20+ students load the test, stream audio and submit at the same moment, and a
teacher on slow internet may upload a large audio file — so serve several requests
in parallel with threads and allow long requests.
"""
import os

workers = int(os.getenv('WEB_CONCURRENCY', '2'))   # 2 fits Render's 512 MB free plan
worker_class = 'gthread'
threads = int(os.getenv('GUNICORN_THREADS', '8'))
timeout = 300            # big uploads / slow connections are not cut off
graceful_timeout = 60
keepalive = 5
