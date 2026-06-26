from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType


class Command(BaseCommand):
    help = "Creates the 'Teachers' group with permissions to add tests and view results only."

    def handle(self, *args, **options):
        group, created = Group.objects.get_or_create(name='Teachers')

        # Models teachers are allowed to fully manage (add/change/view, NOT delete)
        manage_models = [
            ('listening', 'listeningtest'),
            ('listening', 'listeningquestion'),
            ('reading', 'readingtest'),
            ('reading', 'readingpassage'),
            ('reading', 'readingquestion'),
            ('writing', 'writingtest'),
        ]
        # Models teachers can only VIEW (results)
        view_only_models = [
            ('listening', 'listeningattempt'),
            ('reading', 'readingattempt'),
            ('writing', 'writingattempt'),
        ]

        perms_to_add = []

        for app_label, model in manage_models:
            for action in ['add', 'change', 'view']:
                codename = f'{action}_{model}'
                try:
                    perm = Permission.objects.get(
                        codename=codename,
                        content_type__app_label=app_label,
                    )
                    perms_to_add.append(perm)
                except Permission.DoesNotExist:
                    self.stdout.write(self.style.WARNING(f'Permission {codename} not found, skipping.'))

        for app_label, model in view_only_models:
            codename = f'view_{model}'
            try:
                perm = Permission.objects.get(
                    codename=codename,
                    content_type__app_label=app_label,
                )
                perms_to_add.append(perm)
            except Permission.DoesNotExist:
                self.stdout.write(self.style.WARNING(f'Permission {codename} not found, skipping.'))

        group.permissions.set(perms_to_add)
        group.save()

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(
            f'{action} "Teachers" group with {len(perms_to_add)} permissions.'
        ))
