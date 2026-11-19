from django.urls import path
from . import views

urlpatterns = [
    path('info/', views.StudioInfoView.as_view()),
    path('tests/', views.StudioTestsView.as_view()),
    path('parse/', views.ParseView.as_view()),
    path('upload/', views.UploadView.as_view()),
    path('media/<uuid:pk>/<str:name>', views.MediaView.as_view()),
    path('media/<uuid:pk>/', views.MediaView.as_view()),
    path('listening/', views.ListeningStudioView.as_view()),
    path('listening/<int:pk>/', views.ListeningStudioView.as_view()),
    path('reading/', views.ReadingStudioView.as_view()),
    path('reading/<int:pk>/', views.ReadingStudioView.as_view()),
    path('writing/', views.WritingStudioView.as_view()),
    path('writing/<int:pk>/', views.WritingStudioView.as_view()),
]
