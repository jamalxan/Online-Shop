"""Django'ning o'z /admin/ login sahifasini parol saralashdan himoya qiladi."""
from django.core.cache import cache
from django.http import HttpResponse

from apps import otp
from apps.utils import client_ip

MAX_ATTEMPTS = 10
WINDOW = 15 * 60


class DjangoAdminLoginThrottleMiddleware:
    """
    /admin/login/ ga POST so'rovlarini IP bo'yicha cheklaydi (15 daqiqada 10 ta).
    Django admin'da email kod (OTP) yo'q, shuning uchun cheksiz urinish = parolni saralash.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == 'POST' and request.path.startswith('/admin/login'):
            key = 'dj_admin_login:' + otp._key('x', 'ip', client_ip(request))
            if otp._incr(key, WINDOW) > MAX_ATTEMPTS:
                return HttpResponse(
                    "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring.",
                    status=429, content_type='text/plain; charset=utf-8',
                )
            response = self.get_response(request)
            # Muvaffaqiyatli kirish (redirect) hisoblagichni tozalaydi
            if response.status_code in (301, 302) and getattr(request, 'user', None) is not None \
                    and request.user.is_authenticated:
                cache.delete(key)
            return response
        return self.get_response(request)
