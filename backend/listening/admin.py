from django.contrib import admin
from .models import ListeningTest, ListeningQuestion, ListeningAttempt


class ListeningQuestionInline(admin.TabularInline):
    model = ListeningQuestion
    extra = 1
    fields = ['question_number', 'group_title', 'group_instruction',
              'question_type', 'question_text', 'options', 'correct_answer']


@admin.register(ListeningTest)
class ListeningTestAdmin(admin.ModelAdmin):
    list_display = ['title', 'is_active', 'created_by', 'created_at']
    inlines = [ListeningQuestionInline]

    def save_model(self, request, obj, form, change):
        if not change:  # only set on creation
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        # Teachers only see tests they created themselves
        return qs.filter(created_by=request.user)

    def has_change_permission(self, request, obj=None):
        if obj is not None and not request.user.is_superuser and obj.created_by != request.user:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if obj is not None and not request.user.is_superuser and obj.created_by != request.user:
            return False
        return super().has_delete_permission(request, obj)


@admin.register(ListeningAttempt)
class ListeningAttemptAdmin(admin.ModelAdmin):
    list_display = ['user', 'test', 'score', 'submitted_at']
    list_filter = ['test']

    def has_add_permission(self, request):
        return False  # attempts are only created by students via the API

    def has_change_permission(self, request, obj=None):
        return False  # results are read-only for everyone in admin

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        # Teachers see results only for tests they created
        return qs.filter(test__created_by=request.user)
