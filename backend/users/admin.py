from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'phone', 'is_teacher', 'is_staff', 'is_superuser']
    fieldsets = UserAdmin.fieldsets + (
        ('Additional info', {'fields': ('phone', 'is_teacher')}),
    )

    def has_module_permission(self, request):
        # Hide the Users section from teachers entirely — only superusers manage accounts
        if request.user.is_superuser:
            return True
        return False
