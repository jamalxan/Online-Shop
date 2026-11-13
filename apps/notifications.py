"""
Buyurtma bildirishnomalari: mijozga email, do'kon xodimlariga email va (ixtiyoriy) Telegram.

Xabarlar tranzaksiya yakunlangandan keyin, alohida oqimda yuboriladi — SMTP yoki
Telegram sekin/ishlamay qolsa ham checkout javobi kechikmaydi va buyurtma saqlanadi.
Loglarga shaxsiy ma'lumot (email, telefon, manzil) yozilmaydi.
"""
import json
import logging
import threading
import urllib.request

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction

from apps.models import StoreSettings

logger = logging.getLogger(__name__)


def _run(func, *args) -> None:
    def safe():
        try:
            func(*args)
        except Exception:
            logger.exception("Bildirishnoma yuborishda xatolik")

    if getattr(settings, 'NOTIFY_ASYNC', True):
        threading.Thread(target=safe, daemon=True).start()
    else:
        safe()


def _send_telegram(text: str) -> None:
    token, chat_id = settings.TELEGRAM_BOT_TOKEN, settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        return
    # Manzil qat'iy belgilangan (api.telegram.org) — foydalanuvchi kiritgan URL ishlatilmaydi
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=json.dumps({'chat_id': chat_id, 'text': text[:4000]}).encode(),
        headers={'Content-Type': 'application/json'},
    )
    urllib.request.urlopen(request, timeout=5).close()


def _order_lines(items: list[dict]) -> str:
    lines = []
    for item in items:
        variant = ' · '.join(v for v in (item['storage'], item['color']) if v)
        title = f"{item['title']} ({variant})" if variant else item['title']
        lines.append(f"• {title} × {item['quantity']} — {item['total']}")
    return '\n'.join(lines)


def _deliver_order_created(payload: dict) -> None:
    lines = _order_lines(payload['items'])
    total = payload['total']
    numbers = ', '.join(f"#{n}" for n in payload['order_ids'])

    if payload['customer_email']:
        send_mail(
            subject=f"Buyurtmangiz qabul qilindi ({numbers})",
            message=(
                f"Assalomu alaykum, {payload['first_name']}!\n\n"
                f"Buyurtmangiz qabul qilindi:\n{lines}\n\nJami: {total}\n"
                f"Yetkazib berish: {payload['delivery']}\n"
                f"To'lov: {payload['payment']}\n\n"
                f"Holatini \"Buyurtmalarim\" bo'limida kuzatishingiz mumkin.\n\n{payload['store_name']}"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[payload['customer_email']],
            fail_silently=False,
        )

    staff_text = (
        f"Yangi buyurtma {numbers}\n{lines}\nJami: {total}\n"
        f"Mijoz: {payload['first_name']}, {payload['phone']}\n"
        f"Yetkazib berish: {payload['delivery']}\n"
        f"To'lov: {payload['payment']}"
        + (f"\nManzil: {payload['address']}" if payload['address'] else '')
    )
    if settings.ORDER_NOTIFY_EMAILS:
        send_mail(
            subject=f"Yangi buyurtma {numbers} — {total}",
            message=staff_text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=list(settings.ORDER_NOTIFY_EMAILS),
            fail_silently=False,
        )
    _send_telegram(staff_text)


def notify_order_created(orders, store: StoreSettings | None = None) -> None:
    """Buyurtma(lar) saqlangandan keyin chaqiriladi. Xabarlar commit'dan so'ng ketadi."""
    if not orders:
        return
    store = store or StoreSettings.load()
    first = orders[0]
    # Summalar shu yerda matnga aylanadi: saytning standart valyutasida, buyurtmada saqlangan kurs bilan
    payload = {
        'order_ids': [o.pk for o in orders],
        'items': [
            {'title': o.product.title, 'storage': o.storage_label, 'color': o.color_name,
             'quantity': o.quantity, 'total': store.money(o.total_price, o.usd_rate)}
            for o in orders
        ],
        'total': store.money(sum(o.total_price for o in orders), first.usd_rate),
        'first_name': first.first_name,
        'phone': first.phone_number,
        'address': first.address,
        'delivery': first.get_delivery_method_display(),
        # Onlayn usullar hozircha demo: xodim "to'langan" deb o'ylab qolmasligi uchun ochiq yoziladi
        'payment': first.get_payment_method_display() + (
            '' if first.payment_method == first.PaymentMethod.CASH else " (demo — pul yechilmagan)"
        ),
        'customer_email': (first.user.email or '') if first.user_id else '',
        'store_name': store.store_name,
    }
    transaction.on_commit(lambda: _run(_deliver_order_created, payload))


def _deliver_status_changed(email: str, order_id: int, title: str, status_label: str, store_name: str) -> None:
    send_mail(
        subject=f"Buyurtma #{order_id}: {status_label}",
        message=(
            f"Buyurtmangiz holati o'zgardi.\n\n"
            f"#{order_id} — {title}\nYangi holat: {status_label}\n\n{store_name}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )


def notify_order_status(order, store_name: str = 'AppleShop') -> None:
    """Admin holatni o'zgartirganda mijozga xabar beradi (emaili bo'lsa)."""
    if not order.user_id or not order.user.email:
        return
    args = (order.user.email, order.pk, order.product.title, order.get_status_display(), store_name)
    transaction.on_commit(lambda: _run(_deliver_status_changed, *args))
