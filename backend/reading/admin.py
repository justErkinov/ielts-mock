from django.contrib import admin
from .models import ReadingTest, ReadingPassage, ReadingQuestion, ReadingAttempt


class ReadingQuestionInline(admin.TabularInline):
    model = ReadingQuestion
    extra = 3


@admin.register(ReadingPassage)
class ReadingPassageAdmin(admin.ModelAdmin):
    list_display = ['title', 'test', 'passage_number']
    inlines = [ReadingQuestionInline]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(test__created_by=request.user)


class ReadingPassageInline(admin.StackedInline):
    model = ReadingPassage
    extra = 1


@admin.register(ReadingTest)
class ReadingTestAdmin(admin.ModelAdmin):
    list_display = ['title', 'is_active', 'created_by', 'created_at']
    inlines = [ReadingPassageInline]

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


@admin.register(ReadingAttempt)
class ReadingAttemptAdmin(admin.ModelAdmin):
    list_display = ['user', 'test', 'score', 'submitted_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(test__created_by=request.user)
