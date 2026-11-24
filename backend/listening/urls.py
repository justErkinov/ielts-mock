from django.urls import path
from .views import (ListeningTestListView, ListeningTestDetailView, ListeningSubmitView,
                    ListeningGroupSubmitView, ListeningGroupView)

urlpatterns = [
    path('', ListeningTestListView.as_view()),
    path('submit-all/', ListeningGroupSubmitView.as_view()),
    path('<int:pk>/', ListeningTestDetailView.as_view()),
    path('<int:pk>/group/', ListeningGroupView.as_view()),
    path('<int:pk>/submit/', ListeningSubmitView.as_view()),
]