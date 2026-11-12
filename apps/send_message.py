import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils.html import escape

logger = logging.getLogger(__name__)


def send_email(email: str, code, subject: str = "Tasdiqlash kodi") -> bool:
    """OTP kodni emailga yuboradi. Muvaffaqiyatli bo'lsa True."""
    safe_subject = escape(subject)
    safe_code = escape(str(code))
    text = (
        f"{subject}\n\n"
        f"Sizning kodingiz: {code}\n\n"
        f"Kod 5 daqiqa amal qiladi. Uni hech kimga bermang.\n"
        f"Agar bu so'rovni siz yubormagan bo'lsangiz, xatni e'tiborsiz qoldiring.\n\n"
        f"APEX Store"
    )
    html = f"""
        <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:20px">
            <div style="max-width:400px; margin:auto; background:#ffffff; padding:20px; border-radius:8px;">
                <h2 style="color:#333; text-align:center;">{safe_subject}</h2>
                <p style="font-size:16px; color:#555; text-align:center;">Sizning kodingiz:</p>
                <div style="font-size:28px; font-weight:bold; letter-spacing:4px;
                            text-align:center; margin:20px 0; color:#000;">{safe_code}</div>
                <p style="font-size:14px; color:#777; text-align:center;">
                    Kod 5 daqiqa amal qiladi.<br>Uni hech kimga bermang.
                </p>
                <hr>
                <p style="font-size:12px; color:#aaa; text-align:center;">APEX Store</p>
            </div>
        </div>
    """
    try:
        send_mail(
            subject=subject,
            message=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            html_message=html,
            fail_silently=False,
        )
        return True
    except Exception:
        # Manzil va kod logga yozilmaydi
        logger.exception("Email yuborishda xatolik")
        return False
