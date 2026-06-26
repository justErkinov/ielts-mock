from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),
    path('api/listening/', include('listening.urls')),
    path('api/reading/', include('reading.urls')),
    path('api/writing/', include('writing.urls')),
    # path('api/speaking/', include('speaking.urls')),  ← keyinchalik
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)