"""
Bir martalik kodlar (OTP) xizmati.

Xavfsizlik xususiyatlari:
  * kod `secrets` (kriptografik tasodifiy) bilan yaratiladi;
  * keshda kodning o'zi emas, HMAC'i saqlanadi;
  * har bir kod uchun urinishlar soni cheklangan (brute-force'dan himoya);
  * qayta yuborish orasida majburiy pauza va soatlik limit (email-bombing'dan himoya);
  * muvaffaqiyatli tekshiruvdan keyin kod o'chiriladi (bir martalik).
"""
import hashlib
import secrets

from django.core.cache import cache
from django.utils.crypto import constant_time_compare, salted_hmac

CODE_TTL = 5 * 60            # kod amal qilish muddati
RESEND_COOLDOWN = 60         # qayta yuborish orasidagi pauza
MAX_SENDS_PER_HOUR = 5       # bitta manzilga soatiga
MAX_VERIFY_ATTEMPTS = 5      # bitta kodga
GRANT_TTL = 10 * 60          # tasdiqlangandan keyin amalni bajarish uchun vaqt


class OtpError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def normalize(identifier: str) -> str:
    return (identifier or '').strip().lower()


def _key(kind: str, purpose: str, identifier: str) -> str:
    digest = hashlib.sha256(normalize(identifier).encode()).hexdigest()[:40]
    return f"otp:{kind}:{purpose}:{digest}"


def _hash(purpose: str, identifier: str, code: str) -> str:
    return salted_hmac(f"otp:{purpose}", f"{normalize(identifier)}:{code}").hexdigest()


def _incr(key: str, ttl: int) -> int:
    """Atomar hisoblagich (Redis'da INCR)."""
    if cache.add(key, 1, ttl):
        return 1
    try:
        return cache.incr(key)
    except ValueError:  # kalit add va incr orasida eskirdi
        cache.set(key, 1, ttl)
        return 1


def generate_code(length: int = 6) -> str:
    return ''.join(secrets.choice('0123456789') for _ in range(length))


def check_can_send(purpose: str, identifier: str) -> None:
    """Yuborish limitlarini tekshiradi va hisoblagichlarni oshiradi."""
    if not cache.add(_key('cooldown', purpose, identifier), 1, RESEND_COOLDOWN):
        raise OtpError("Kod yaqinda yuborilgan. Bir daqiqadan keyin qayta urinib ko'ring.", 429)
    if _incr(_key('sends', purpose, identifier), 3600) > MAX_SENDS_PER_HOUR:
        raise OtpError("Juda ko'p so'rov. Bir soatdan keyin qayta urinib ko'ring.", 429)


def issue(purpose: str, identifier: str, *, enforce_limits: bool = True) -> str:
    """Yangi kod yaratadi, saqlaydi va qaytaradi (yuborish chaqiruvchining ishi)."""
    if enforce_limits:
        check_can_send(purpose, identifier)
    code = generate_code()
    cache.set(_key('code', purpose, identifier), _hash(purpose, identifier, code), CODE_TTL)
    cache.delete(_key('attempts', purpose, identifier))
    return code


def verify(purpose: str, identifier: str, code: str) -> None:
    """Kodni tekshiradi. Xato bo'lsa OtpError. To'g'ri bo'lsa kod o'chiriladi."""
    code_key = _key('code', purpose, identifier)
    stored = cache.get(code_key)
    if not stored:
        raise OtpError("Kod muddati tugagan yoki topilmadi. Yangi kod so'rang.")

    attempts_key = _key('attempts', purpose, identifier)
    if _incr(attempts_key, CODE_TTL) > MAX_VERIFY_ATTEMPTS:
        cache.delete(code_key)
        cache.delete(attempts_key)
        raise OtpError("Juda ko'p noto'g'ri urinish. Yangi kod so'rang.", 429)

    if not constant_time_compare(stored, _hash(purpose, identifier, str(code).strip())):
        raise OtpError("Kod noto'g'ri")

    cache.delete(code_key)
    cache.delete(attempts_key)


def grant(purpose: str, identifier: str) -> None:
    """Kod tasdiqlanganini belgilaydi (keyingi qadam uchun ruxsat)."""
    cache.set(_key('grant', purpose, identifier), 1, GRANT_TTL)


def has_grant(purpose: str, identifier: str) -> bool:
    return bool(cache.get(_key('grant', purpose, identifier)))


def consume_grant(purpose: str, identifier: str) -> None:
    cache.delete(_key('grant', purpose, identifier))
