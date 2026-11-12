import logging
import os
import secrets

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.auth_cookies import enforce_trusted_origin, token_response
from apps.models import User

logger = logging.getLogger(__name__)


def _get_firebase_auth():
    """Lazy Firebase init — SDK yoki credentials bo'lmasa (None, sabab) qaytaradi."""
    try:
        import firebase_admin
        from firebase_admin import auth as fb_auth, credentials
    except ImportError:
        return None, "firebase-admin o'rnatilmagan"

    try:
        firebase_admin.get_app()
    except ValueError:
        cred_path = settings.FIREBASE_CREDENTIALS
        if not os.path.exists(cred_path):
            return None, "Firebase credentials fayli topilmadi"
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    return fb_auth, None


@extend_schema(tags=['Auth'])
class FirebaseLoginAPIView(APIView):
    """
    Firebase Phone Auth ID tokenini qabul qilib, JWT qaytaradi.
    Body: { "firebase_token": "..." }

    Telefon raqami FAQAT Firebase tasdiqlagan tokendan olinadi. So'rov tanasidagi
    phone_number e'tiborga olinmaydi — aks holda istalgan Firebase hisobi bilan
    boshqa odamning raqamini ko'rsatib, uning akkauntiga kirish mumkin bo'lardi.
    """
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_scope = 'login'

    def post(self, request):
        enforce_trusted_origin(request)  # javob sessiya cookie'sini o'rnatadi
        fb_auth, reason = _get_firebase_auth()
        if fb_auth is None:
            logger.error("Firebase login ishlamayapti: %s", reason)
            return Response(
                {'error': "Telefon orqali kirish vaqtincha ishlamayapti"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        firebase_token = request.data.get('firebase_token')
        if not firebase_token or not isinstance(firebase_token, str):
            return Response({'error': 'firebase_token majburiy'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            decoded = fb_auth.verify_id_token(firebase_token, check_revoked=True)
        except Exception:
            return Response(
                {'error': "Firebase token noto'g'ri yoki muddati tugagan"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        phone_number = decoded.get('phone_number')
        if not phone_number:
            return Response(
                {'error': 'Token telefon raqami bilan tasdiqlanmagan'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user, created = User.objects.get_or_create(
            phone_number=phone_number,
            defaults={'username': f'user_{secrets.token_hex(6)}'},
        )
        if not user.is_active:
            return Response({'error': 'Hisob faol emas'}, status=status.HTTP_403_FORBIDDEN)
        if user.is_staff and settings.ADMIN_OTP_REQUIRED:
            return Response(
                {'error': "Admin hisoblar faqat admin panel orqali kiradi"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])

        refresh = RefreshToken.for_user(user)
        return token_response(refresh, {'created': created, 'phone_number': phone_number})
