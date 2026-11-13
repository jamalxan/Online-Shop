import os
import sys
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name: str, default: str = '') -> list[str]:
    return [v.strip() for v in os.getenv(name, default).split(',') if v.strip()]


TESTING = len(sys.argv) > 1 and sys.argv[1] == 'test'

DEBUG = env_bool('DEBUG', False)

SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured("SECRET_KEY .env faylida ko'rsatilishi shart")
if not DEBUG and (len(SECRET_KEY) < 50 or SECRET_KEY.startswith('django-insecure')):
    raise ImproperlyConfigured("Production uchun kuchli (50+ belgi) SECRET_KEY kerak")

ALLOWED_HOSTS = env_list('ALLOWED_HOSTS', 'localhost,127.0.0.1' if DEBUG else '')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'drf_spectacular',
    'apps',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'apps.middleware.DjangoAdminLoginThrottleMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'OnlineShop.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'OnlineShop.wsgi.application'

# ─── Database ─────────────────────────────────────────────
if os.getenv('DB_NAME'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME'),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
            'PASSWORD': os.getenv('DB_PASSWORD'),
            'USER': os.getenv('DB_USER'),
            'CONN_MAX_AGE': 60,
            'CONN_HEALTH_CHECKS': True,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_USER_MODEL = 'apps.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

if TESTING:
    # Testlarda tez xesh (PBKDF2 ataylab sekin — yuzlab testda daqiqalar ketadi)
    PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

# ─── REST Framework ───────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        # Har bir view o'z ruxsatini aniq ko'rsatadi; unutilgan view ochiq qolmasligi uchun
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_RENDERER_CLASSES': (
        ('rest_framework.renderers.JSONRenderer', 'rest_framework.renderers.BrowsableAPIRenderer')
        if DEBUG else ('rest_framework.renderers.JSONRenderer',)
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '240/min',
        'user': '600/min',
        'otp_send': '5/min',
        'otp_verify': '10/min',
        'login': '10/min',
        # Har bir sahifa yuklanishida chaqiriladi (access token faqat xotirada), bir ofis bitta
        # IP ortida o'tirishi mumkin — shuning uchun login limitidan ancha keng. Imzolangan
        # token talab qilinadi, ya'ni bu yerda taxmin qilib topadigan narsa yo'q.
        'token_refresh': '120/min',
        'register': '10/hour',
        'orders': '20/min',
        'payments': '10/hour',
        'newsletter': '10/hour',
        'contact': '5/hour',
    },
    # Reverse proxy (nginx) ortida bo'lsa 1 qiling. 0 = X-Forwarded-For ga ishonilmaydi
    # (aks holda mijoz sarlavhani soxtalashtirib rate-limit'ni aylanib o'tadi).
    'NUM_PROXIES': int(os.getenv('NUM_PROXIES', '0')),
}

# ─── Simple JWT ───────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Admin (is_staff) foydalanuvchilar faqat email OTP orqali kiradi (/api/admin/auth/...)
ADMIN_OTP_REQUIRED = env_bool('ADMIN_OTP_REQUIRED', True)
# Admin sessiyasining mutlaq muddati: refresh token aylantirilsa ham shundan keyin qayta kirish kerak
ADMIN_SESSION_HOURS = int(os.getenv('ADMIN_SESSION_HOURS', '12'))
# Django'ning o'z /admin/ sahifasi faqat parol bilan himoyalangan (email kod yo'q), shuning
# uchun production'da sukut bo'yicha o'chiq. Yoqilsa, kirish urinishlari IP bo'yicha cheklanadi.
DJANGO_ADMIN_ENABLED = env_bool('DJANGO_ADMIN_ENABLED', DEBUG)

# ─── Bildirishnomalar (ixtiyoriy) ─────────────────────────
# Yangi buyurtma haqida xabar oladigan manzillar (vergul bilan)
ORDER_NOTIFY_EMAILS = env_list('ORDER_NOTIFY_EMAILS')
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')
# Testlarda xabarlar sinxron yuboriladi (mail.outbox'da darhol ko'rinadi)
NOTIFY_ASYNC = not TESTING

# Onlayn to'lov usullari (Apple Pay, Google Pay, Click, Payme, Xazna) hali haqiqiy to'lov tizimiga
# ulanmagan: yoqilgan bo'lsa, ular DEMO rejimda ishlaydi — pul yechilmaydi, to'lov "demo" deb yoziladi.
# Haqiqiy savdoda chalkashlik bo'lmasligi uchun DEMO_PAYMENTS=False qilib o'chiring:
# shunda saytda faqat "qabul qilganda to'lash" (va kartaga o'tkazma) qoladi.
DEMO_PAYMENTS = env_bool('DEMO_PAYMENTS', True)

# ─── CORS / CSRF ──────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')
# Lokal ishda Next.js band portdan keyingisiga (3001, 3002...) o'tib ketadi. ^ va $ shart:
# corsheaders re.match ishlatadi, langarsiz ifoda "http://localhost.evil.com" ni ham o'tkazardi.
LOCAL_DEV_ORIGIN_REGEX = r'^http://(localhost|127\.0\.0\.1)(:\d+)?$'
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES = [LOCAL_DEV_ORIGIN_REGEX]
# Refresh token httpOnly cookie'da keladi, shuning uchun brauzer cookie yuborishi kerak.
# Bu faqat yuqoridagi aniq ro'yxatdagi manzillarga ruxsat beradi ("*" ishlatilmaydi).
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS')

# ─── Refresh token cookie'si ──────────────────────────────
AUTH_COOKIE_NAME = 'refresh_token'
# Faqat yangilash va chiqish endpointlariga yuboriladi, boshqa so'rovlarda umuman ketmaydi
AUTH_COOKIE_PATH = '/api/auth/'
AUTH_COOKIE_SECURE = env_bool('AUTH_COOKIE_SECURE', not DEBUG)
# Lax: frontend va API bitta asosiy domenda (shop.uz + api.shop.uz) bo'lsa yetarli.
# Ular butunlay boshqa domenlarda bo'lsa None kerak (faqat HTTPS bilan ishlaydi).
AUTH_COOKIE_SAMESITE = os.getenv('AUTH_COOKIE_SAMESITE', 'Lax').capitalize()
AUTH_COOKIE_DOMAIN = os.getenv('AUTH_COOKIE_DOMAIN') or None
if AUTH_COOKIE_SAMESITE not in ('Lax', 'Strict', 'None'):
    raise ImproperlyConfigured("AUTH_COOKIE_SAMESITE: Lax, Strict yoki None bo'lishi kerak")
if AUTH_COOKIE_SAMESITE == 'None' and not AUTH_COOKIE_SECURE:
    raise ImproperlyConfigured("AUTH_COOKIE_SAMESITE=None faqat AUTH_COOKIE_SECURE=True bilan ishlaydi")

# ─── DRF Spectacular ─────────────────────────────────────
SPECTACULAR_SETTINGS = {
    'TITLE': 'AppleShop API',
    'DESCRIPTION': 'AppleShop (Apple mahsulotlari do\'koni) uchun backend API',
    'VERSION': '1.0.0',
}

# ─── Email ────────────────────────────────────────────────
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('GMAIL_APP_PASSWORD', '')
if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
    EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
    EMAIL_USE_TLS = True
    EMAIL_TIMEOUT = 10
elif DEBUG:
    # SMTP sozlanmagan bo'lsa, kodlar konsolga chiqadi (faqat development)
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
else:
    raise ImproperlyConfigured("Production uchun EMAIL_HOST_USER va GMAIL_APP_PASSWORD kerak")
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL') or EMAIL_HOST_USER or 'noreply@localhost'

# ─── Cache (OTP, rate-limit) ──────────────────────────────
if os.getenv('REDIS_HOST') and not TESTING:
    _redis_password = os.getenv('REDIS_PASSWORD', '')
    _redis_auth = f":{_redis_password}@" if _redis_password else ''
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': (
                f"redis://{_redis_auth}{os.getenv('REDIS_HOST')}:"
                f"{os.getenv('REDIS_PORT', '6379')}/1"
            ),
            'KEY_PREFIX': 'apex',
        }
    }
elif DEBUG or TESTING:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
else:
    # LocMem har bir worker'da alohida — OTP va rate-limit ishonchsiz bo'lib qoladi
    raise ImproperlyConfigured("Production uchun REDIS_HOST kerak (OTP va rate-limit uchun)")

# ─── Firebase (telefon orqali kirish, ixtiyoriy) ──────────
FIREBASE_CREDENTIALS = os.getenv('FIREBASE_CREDENTIALS', 'serviceAccountKey.json')

# ─── Localization ─────────────────────────────────────────
LANGUAGE_CODE = 'uz'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True

# ─── Static & Media ───────────────────────────────────────
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = 'media/'
# Papka nomi diskdagi mavjud "Media" bilan bir xil (Linux'da registr farq qiladi)
MEDIA_ROOT = BASE_DIR / 'Media'
# To'lov cheklari: /media/ ostida emas, faqat himoyalangan API orqali beriladi
PRIVATE_MEDIA_ROOT = Path(os.getenv('PRIVATE_MEDIA_ROOT') or BASE_DIR / 'private_media')

# Yuklamalar chegarasi
MAX_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024          # bitta rasm: 5 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024   # fayl bo'lmagan so'rov tanasi
DATA_UPLOAD_MAX_NUMBER_FILES = 20

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── Security ─────────────────────────────────────────────
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'

if not DEBUG:
    if not ALLOWED_HOSTS:
        raise ImproperlyConfigured("Production uchun ALLOWED_HOSTS ko'rsatilishi shart")
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = env_bool('SECURE_SSL_REDIRECT', True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', str(60 * 60 * 24 * 365)))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = env_bool('SECURE_HSTS_PRELOAD', False)

# ─── Logging ──────────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'default': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'default'},
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
    'loggers': {
        'django.security': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'apps': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}
