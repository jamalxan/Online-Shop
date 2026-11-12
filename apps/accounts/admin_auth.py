"""
Admin panel uchun ikki bosqichli kirish: parol + emailga yuborilgan bir martalik kod.
Faqat is_staff=True yoki is_superuser=True foydalanuvchilar kira oladi.

Oqim:
  1. POST login/   {email, password}      -> {challenge, email (niqoblangan)}
  2. POST verify/  {challenge, code}      -> {access, refresh, user}
     POST resend/  {challenge}            -> yangi kod (pauza va limit bilan)

`challenge` — parol to'g'ri kiritilgandan keyingina beriladigan tasodifiy token.
Kodni tekshirish va qayta yuborish faqat shu token bilan ishlaydi, shuning uchun
parolni bilmagan odam kod so'rata olmaydi va kodni saralab topa olmaydi.
"""
import logging
import secrets
import time

from django.contrib.auth import authenticate, get_user_model
from django.core.cache import cache
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps import otp
from apps.auth_cookies import enforce_trusted_origin, token_response
from apps.models import AdminAuditLog
from apps.send_message import send_email
from apps.utils import client_ip

logger = logging.getLogger(__name__)
User = get_user_model()

OTP_ADMIN = 'admin_login'
CHALLENGE_TTL = 10 * 60
MAX_FAILED_LOGINS = 5
LOCKOUT_TTL = 10 * 60

INVALID_CREDENTIALS = "Login yoki parol noto'g'ri"


def _challenge_key(challenge: str) -> str:
    return f"admin_challenge:{challenge}"


def _fail_key(request, identifier: str) -> str:
    # IP + login bo'yicha: hujumchi boshqa odamning adminini bloklab qo'ya olmaydi
    ip = request.META.get('REMOTE_ADDR', '')
    return "admin_fail:" + otp._key('x', ip, identifier)


def _mask_email(email: str) -> str:
    local, _, domain = (email or '').partition('@')
    return f"{local[:1]}***@{domain}" if domain else "***"


def _find_user(identifier: str):
    """Email yoki username bo'yicha."""
    identifier = identifier.strip()
    if '@' in identifier:
        return User.objects.filter(email__iexact=identifier).first()
    return User.objects.filter(username__iexact=identifier).first()


@extend_schema(tags=['Admin Auth'])
class AdminLoginView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_scope = 'login'

    def post(self, request):
        identifier = str(request.data.get('email') or request.data.get('username') or '').strip()
        password = str(request.data.get('password') or '')
        if not identifier or not password:
            return Response({'error': "Login va parol kiritish shart"}, status=status.HTTP_400_BAD_REQUEST)

        fail_key = _fail_key(request, identifier)
        if (cache.get(fail_key) or 0) >= MAX_FAILED_LOGINS:
            return Response(
                {'error': "Juda ko'p noto'g'ri urinish. 10 daqiqadan keyin qayta urinib ko'ring."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        candidate = _find_user(identifier)
        user = authenticate(request, username=candidate.email, password=password) if candidate else None

        # Admin emasligi ham xuddi shu javob bilan qaytadi — hisob turini oshkor qilmaslik uchun
        if user is None or not (user.is_staff or user.is_superuser):
            otp._incr(fail_key, LOCKOUT_TTL)
            return Response({'error': INVALID_CREDENTIALS}, status=status.HTTP_401_UNAUTHORIZED)

        cache.delete(fail_key)
        challenge = secrets.token_urlsafe(32)
        try:
            # Yuborish limiti foydalanuvchi bo'yicha (har login yangi challenge bo'lgani uchun)
            otp.check_can_send(OTP_ADMIN, f"user:{user.pk}")
        except otp.OtpError as exc:
            return Response({'error': exc.message}, status=exc.status)
        code = otp.issue(OTP_ADMIN, challenge, enforce_limits=False)
        cache.set(_challenge_key(challenge), user.pk, CHALLENGE_TTL)

        if not send_email(user.email, code, subject="APEX Admin — kirish kodi"):
            return Response(
                {'error': "Email yuborib bo'lmadi. Server sozlamalarini tekshiring."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({
            'message': "Tasdiqlash kodi emailga yuborildi",
            'email': _mask_email(user.email),
            'challenge': challenge,
        })


@extend_schema(tags=['Admin Auth'])
class AdminVerifyOtpView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_scope = 'otp_verify'

    def post(self, request):
        enforce_trusted_origin(request)  # javob sessiya cookie'sini o'rnatadi
        challenge = str(request.data.get('challenge') or '').strip()
        code = str(request.data.get('code') or '').strip()
        if not challenge or not code:
            return Response({'error': "Kod kiritish shart"}, status=status.HTTP_400_BAD_REQUEST)

        user_id = cache.get(_challenge_key(challenge))
        if not user_id:
            return Response(
                {'error': "Sessiya muddati tugagan. Qaytadan kiring."}, status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            otp.verify(OTP_ADMIN, challenge, code)
        except otp.OtpError as exc:
            if exc.status == 429:
                cache.delete(_challenge_key(challenge))
            return Response({'error': exc.message}, status=exc.status)

        cache.delete(_challenge_key(challenge))
        user = User.objects.filter(pk=user_id, is_active=True).first()
        if not user or not (user.is_staff or user.is_superuser):
            return Response({'error': INVALID_CREDENTIALS}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        # Admin sessiyasi belgisi: /api/auth/refresh/ shu belgiga qarab mutlaq muddatni tekshiradi
        refresh['adm'] = True
        refresh['sess'] = int(time.time())
        logger.info("Admin kirdi: user_id=%s", user.pk)
        AdminAuditLog.objects.create(
            actor=user, actor_email=user.email or '', action='auth.login',
            summary='Parol + email kod', ip=client_ip(request) or None,
        )
        return token_response(refresh, {
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
            },
        })


@extend_schema(tags=['Admin Auth'])
class AdminResendOtpView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_scope = 'otp_send'

    def post(self, request):
        challenge = str(request.data.get('challenge') or '').strip()
        user_id = cache.get(_challenge_key(challenge)) if challenge else None
        if not user_id:
            return Response(
                {'error': "Sessiya muddati tugagan. Qaytadan kiring."}, status=status.HTTP_400_BAD_REQUEST,
            )
        user = User.objects.filter(pk=user_id, is_active=True).first()
        if not user:
            return Response({'error': INVALID_CREDENTIALS}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            otp.check_can_send(OTP_ADMIN, f"user:{user.pk}")
        except otp.OtpError as exc:
            return Response({'error': exc.message}, status=exc.status)
        code = otp.issue(OTP_ADMIN, challenge, enforce_limits=False)
        if not send_email(user.email, code, subject="APEX Admin — kirish kodi"):
            return Response({'error': "Email yuborib bo'lmadi"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'message': "Yangi kod yuborildi"})
