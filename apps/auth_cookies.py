"""
Refresh token brauzerda httpOnly cookie'da yashaydi.

Nega: ilgari refresh token (7 kun yashaydi) JSON javobida berilib, localStorage'da
saqlanardi — sahifadagi istalgan XSS uni o'qib, tashqariga olib chiqib keta olardi.
Endi JavaScript uni umuman ko'rmaydi: javob tanasida faqat 15 daqiqalik access token
qaytadi (u ham faqat xotirada turadi), refresh token esa `Set-Cookie` orqali beriladi.

Cookie faqat /api/auth/ yo'liga yuboriladi (yangilash va chiqish), ya'ni oddiy API
so'rovlari cookie bilan emas, `Authorization: Bearer` bilan ishlaydi — shu sababli ularga
CSRF tahdid solmaydi. Cookie o'qiladigan ikki endpoint SameSite + Origin tekshiruvi bilan
himoyalangan.
"""
import re
import time
from urllib.parse import urlsplit

from django.conf import settings
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response


def _max_age(refresh) -> int:
    """Cookie token bilan bir vaqtda tugaydi (admin sessiyasida — mutlaq muddatdan oshmaydi)."""
    remaining = int(refresh['exp']) - int(time.time())
    if refresh.get('adm'):
        session_left = int(refresh.get('sess', 0) or 0) + settings.ADMIN_SESSION_HOURS * 3600 - int(time.time())
        remaining = min(remaining, session_left)
    return max(remaining, 0)


def set_refresh_cookie(response, refresh) -> None:
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        str(refresh),
        max_age=_max_age(refresh),
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        secure=settings.AUTH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )


def clear_refresh_cookie(response) -> None:
    # delete_cookie() SameSite=None bo'lganda Secure'ni o'zi qo'shadi; qolgan atributlar
    # set_cookie bilan bir xil bo'lmasa brauzer cookie'ni o'chirmaydi
    response.delete_cookie(
        settings.AUTH_COOKIE_NAME,
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )


def read_refresh_cookie(request) -> str:
    return request.COOKIES.get(settings.AUTH_COOKIE_NAME) or ''


def no_store(response) -> Response:
    """Token olib yuruvchi javob hech qayerda (brauzer, proxy, CDN) keshlanmasligi kerak."""
    response['Cache-Control'] = 'no-store'
    return response


def token_response(refresh, extra: dict | None = None, status_code: int = 200) -> Response:
    """Kirish javobi: tanada access token, refresh token — faqat httpOnly cookie'da."""
    response = Response({'access': str(refresh.access_token), **(extra or {})}, status=status_code)
    set_refresh_cookie(response, refresh)
    return no_store(response)


def _origin_of(url: str) -> str:
    parts = urlsplit(url)
    return f'{parts.scheme}://{parts.netloc}' if parts.scheme and parts.netloc else ''


def _is_trusted(origin: str, request) -> bool:
    if origin == f'{request.scheme}://{request.get_host()}':
        return True  # frontend va API bitta origin'da (reverse proxy)
    if origin in settings.CORS_ALLOWED_ORIGINS or origin in settings.CSRF_TRUSTED_ORIGINS:
        return True
    return any(re.fullmatch(pattern, origin) for pattern in getattr(settings, 'CORS_ALLOWED_ORIGIN_REGEXES', ()))


def enforce_trusted_origin(request) -> None:
    """
    Sessiya cookie'sini o'qiydigan YOKI o'rnatadigan endpointlar uchun CSRF himoyasi
    (SameSite ustiga ikkinchi qatlam).

    Brauzer boshqa saytdan POST yuborsa `Origin` (yoki `Referer`) sarlavhasini albatta
    qo'shadi; u ruxsat etilgan frontend manzili bo'lmasa so'rov rad etiladi. Sarlavha umuman
    yo'q bo'lsa — bu brauzer emas (curl, mobil ilova): unda begona cookie ham bo'lmaydi.

    Kirish endpointlarida ham kerak ("login CSRF"): busiz begona sayt yashirin forma orqali
    qurbonni HUJUMCHINING hisobiga kiritib qo'ya olardi (javobdagi Set-Cookie brauzerga
    yoziladi) va qurbon manzilini, buyurtmasini o'sha hisobga kiritgan bo'lardi.
    """
    origin = request.headers.get('Origin')
    if origin is None:
        referer = request.headers.get('Referer')
        if not referer:
            return
        origin = _origin_of(referer)
    if not _is_trusted(origin, request):
        raise PermissionDenied("So'rov manbasi ruxsat etilmagan.")
