"""
WSGI config for config project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()


def _migrate_on_start():
    """Apply new database migrations when the server starts, so a deploy never
    needs a manual 'migrate'. A Postgres advisory lock keeps several workers
    from migrating at the same time."""
    if os.getenv('MIGRATE_ON_START', '1') != '1':
        return
    import logging
    from django.core.management import call_command
    from django.db import connection
    log = logging.getLogger(__name__)
    try:
        pg = connection.vendor == 'postgresql'
        if pg:
            with connection.cursor() as c:
                c.execute('SELECT pg_advisory_lock(7539847)')
        try:
            call_command('migrate', interactive=False, verbosity=1)
        finally:
            if pg:
                with connection.cursor() as c:
                    c.execute('SELECT pg_advisory_unlock(7539847)')
    except Exception:  # never stop the site from starting because of this
        log.exception('Automatic migrate failed')


_migrate_on_start()
