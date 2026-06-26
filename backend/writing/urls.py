from django.urls import path
from .views import (
    WritingTestListView,
    WritingTestDetailView,
    WritingSubmitView,
    WritingMyAttemptsView,
)

urlpatterns = [
    path('', WritingTestListView.as_view()),
    path('<int:pk>/', WritingTestDetailView.as_view()),
    path('<int:pk>/submit/', WritingSubmitView.as_view()),
    path('my-attempts/', WritingMyAttemptsView.as_view()),
]