from django.contrib import admin
from .models import WritingTest, WritingAttempt


@admin.register(WritingTest)
class WritingTestAdmin(admin.ModelAdmin):
    list_display = ['title', 'is_active', 'created_by', 'created_at']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(created_by=request.user)

    def has_change_permission(self, request, obj=None):
        if obj is not None and not request.user.is_superuser and obj.created_by != request.user:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if obj is not None and not request.user.is_superuser and obj.created_by != request.user:
            return False
        return super().has_delete_permission(request, obj)


@admin.register(WritingAttempt)
class WritingAttemptAdmin(admin.ModelAdmin):
    list_display = ['user', 'test', 'teacher_score', 'submitted_at']
    list_filter = ['test']
    # Teacher fills in score and feedback here — text fields stay read-only
    fields = ['user', 'test', 'task1_text', 'task2_text',
              'teacher_score', 'teacher_feedback']
    readonly_fields = ['user', 'test', 'task1_text', 'task2_text', 'submitted_at']

    def has_add_permission(self, request):
        return False

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(test__created_by=request.user)
