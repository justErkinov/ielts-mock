from django.urls import path
from .views import ReadingTestListView, ReadingTestDetailView, ReadingSubmitView

urlpatterns = [
    path('', ReadingTestListView.as_view()),
    path('<int:pk>/', ReadingTestDetailView.as_view()),
    path('<int:pk>/submit/', ReadingSubmitView.as_view()),
]