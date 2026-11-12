from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(request):
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('api/health/', health),

    # Admin auth (parol + email OTP)
    path('api/admin/auth/', include('apps.accounts.admin_urls')),
    # Admin panel API (faqat is_staff; har bir o'zgartirish audit jurnaliga yoziladi)
    path('api/admin/', include('apps.admin_panel.urls')),

    path('api/', include('apps.urls')),
]

if settings.DJANGO_ADMIN_ENABLED:
    # Django'ning o'z admin sahifasi faqat parol bilan himoyalangan (email kod yo'q).
    # Production'da sukut bo'yicha o'chiq — kerak bo'lsa DJANGO_ADMIN_ENABLED=True.
    urlpatterns.insert(0, path('admin/', admin.site.urls))

if settings.DEBUG:
    # API hujjatlari va media fayllar faqat development'da Django orqali beriladi.
    # Production'da media'ni nginx (yoki obyekt saqlash xizmati) tarqatadi.
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    ]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
