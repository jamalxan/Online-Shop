"""Savat va buyurtma biznes-logikasi (view'lardan ajratilgan, test qilish oson)."""
import uuid
from collections import defaultdict

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.models import (
    Cart, CartItem, ColorVariant, Order, Payment, Product, StorageOption, StoreSettings, apply_discount,
)


class ShopError(Exception):
    """Foydalanuvchiga ko'rsatiladigan biznes xatosi."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def resolve_variant(product: Product, storage_option_id=None, color_variant_id=None):
    """Variantlar shu mahsulotga tegishli ekanini tekshiradi va obyektlarni qaytaradi."""
    storage = None
    if storage_option_id:
        storage = StorageOption.objects.filter(pk=storage_option_id, product=product).first()
        if not storage:
            raise ShopError("Xotira varianti bu mahsulotga tegishli emas")
    else:
        # Variantli mahsulot uchun tanlanmagan bo'lsa — eng arzoni (kartochkada ko'rsatilgan narx)
        storage = StorageOption.objects.filter(product=product).order_by('price', 'id').first()

    color = None
    if color_variant_id:
        color = ColorVariant.objects.filter(pk=color_variant_id, product=product).first()
        if not color:
            raise ShopError("Rang varianti bu mahsulotga tegishli emas")
    return storage, color


def _storage_label(storage) -> str:
    if not storage:
        return ''
    return f"{storage.storage} / {storage.ram}" if storage.ram else storage.storage


def get_cart(user) -> Cart:
    cart, _ = Cart.objects.get_or_create(user=user)
    return cart


def _reserved_in_cart(cart: Cart, product: Product, exclude_item_id=None) -> int:
    qs = cart.items.filter(product=product)
    if exclude_item_id:
        qs = qs.exclude(pk=exclude_item_id)
    return sum(qs.values_list('quantity', flat=True))


@transaction.atomic
def add_to_cart(user, product_id, quantity=1, storage_option_id=None, color_variant_id=None) -> Cart:
    product = Product.objects.filter(pk=product_id, is_active=True).first()
    if not product:
        raise ShopError("Mahsulot topilmadi yoki sotuvda yo'q", 404)
    storage, color = resolve_variant(product, storage_option_id, color_variant_id)

    # Savat qatorini qulflash: parallel so'rovlar dublikat qator yaratmasligi uchun
    cart = Cart.objects.select_for_update().get(pk=get_cart(user).pk)
    item = cart.items.filter(product=product, storage_option=storage, color_variant=color).first()

    wanted = quantity + (item.quantity if item else 0)
    others = _reserved_in_cart(cart, product, exclude_item_id=item.pk if item else None)
    if wanted + others > product.quantity:
        raise ShopError(f"Omborda faqat {product.quantity} dona mavjud")
    if wanted > 100:
        raise ShopError("Bitta mahsulotdan ko'pi bilan 100 dona qo'shish mumkin")

    if item:
        item.quantity = wanted
        item.save(update_fields=['quantity'])
    else:
        CartItem.objects.create(
            cart=cart, product=product, storage_option=storage, color_variant=color, quantity=quantity,
        )
    cart.save(update_fields=['updated_at'])
    return cart


@transaction.atomic
def update_cart_item(item: CartItem, quantity: int) -> Cart:
    product = item.product
    if not product.is_active:
        raise ShopError("Mahsulot sotuvda yo'q")
    others = _reserved_in_cart(item.cart, product, exclude_item_id=item.pk)
    if quantity + others > product.quantity:
        raise ShopError(f"Omborda faqat {product.quantity} dona mavjud")
    item.quantity = quantity
    item.save(update_fields=['quantity'])
    return item.cart


@transaction.atomic
def create_orders(user, data: dict) -> list[Order]:
    """
    Buyurtma(lar) yaratadi. To'liq atomar: biror mahsulot yetmasa hech narsa saqlanmaydi.
    Narx faqat serverda hisoblanadi va buyurtmada saqlanadi (snapshot).
    """
    payment_method = data.get('payment_method') or Order.PaymentMethod.CASH
    pay_online = payment_method != Order.PaymentMethod.CASH
    if pay_online and not settings.DEMO_PAYMENTS:
        # Haqiqiy to'lov tizimi ulanmagan: demo o'chiq bo'lsa, to'lanmagan buyurtma "to'langan" bo'lib qolmasin
        raise ShopError("Onlayn to'lov hozircha ulanmagan. «Qabul qilganda to'lash» usulini tanlang.")

    if data.get('from_cart'):
        cart = get_cart(user)
        lines = [
            (item.product_id, item.storage_option, item.color_variant, item.quantity)
            for item in cart.items.select_related('storage_option', 'color_variant')
        ]
        if not lines:
            raise ShopError("Savat bo'sh")
    else:
        cart = None
        product = Product.objects.filter(pk=data['product_id']).first()
        if not product:
            raise ShopError("Mahsulot topilmadi", 404)
        storage, color = resolve_variant(product, data.get('storage_option_id'), data.get('color_variant_id'))
        lines = [(product.pk, storage, color, data.get('quantity', 1))]

    # Mahsulotlarni qulflash (pk tartibida — deadlock bo'lmasligi uchun)
    product_ids = sorted({line[0] for line in lines})
    products = {p.pk: p for p in Product.objects.select_for_update().filter(pk__in=product_ids).order_by('pk')}

    needed = defaultdict(int)
    for product_id, _, _, quantity in lines:
        needed[product_id] += quantity

    for product_id, quantity in needed.items():
        product = products.get(product_id)
        if not product or not product.is_active:
            raise ShopError("Savatdagi mahsulotlardan biri endi sotuvda yo'q", 409)
        if product.quantity < quantity:
            raise ShopError(f"{product.title} uchun yetarli miqdor yo'q (omborda: {product.quantity})", 409)

    checkout_id = uuid.uuid4()
    usd_rate = StoreSettings.load().usd_rate
    orders = []
    for product_id, storage, color, quantity in lines:
        product = products[product_id]
        unit_price = apply_discount(storage.price if storage else product.price, product.discount)
        orders.append(Order(
            product=product, user=user, checkout_id=checkout_id,
            storage_option=storage, color_variant=color,
            storage_label=_storage_label(storage), color_name=color.name if color else '',
            unit_price=unit_price, total_price=unit_price * quantity, usd_rate=usd_rate,
            first_name=data['first_name'], phone_number=data['phone_number'],
            address=data.get('address', ''), delivery_method=data.get('delivery_method', Order.Delivery.STANDARD),
            comment=data.get('comment', ''), payment_method=payment_method,
            quantity=quantity, has_discount=product.discount > 0,
        ))

    for product_id, quantity in needed.items():
        Product.objects.filter(pk=product_id).update(quantity=F('quantity') - quantity)

    for order in orders:
        order.save()
    if pay_online:
        # DEMO: pul yechilmaydi. Summa serverda hisoblanadi; yozuv shu tranzaksiya ichida —
        # buyurtma saqlanmasa, to'lov ham qolmaydi.
        Payment.objects.create(
            user=user, checkout_id=checkout_id, amount=sum(o.total_price for o in orders),
            status=Payment.PayStatus.COMPLETED, type=Payment.PayType.MONEY,
            provider=payment_method, is_demo=True,
        )
    if cart is not None:
        cart.items.all().delete()
    return orders


ALLOWED_TRANSITIONS = {
    Order.Status.PENDING: {Order.Status.PREPARING, Order.Status.SHIPPING, Order.Status.DELIVERED, Order.Status.CANCELED},
    Order.Status.PREPARING: {Order.Status.PENDING, Order.Status.SHIPPING, Order.Status.DELIVERED, Order.Status.CANCELED},
    Order.Status.SHIPPING: {Order.Status.PREPARING, Order.Status.DELIVERED, Order.Status.CANCELED},
    Order.Status.DELIVERED: set(),
    Order.Status.CANCELED: set(),
}


@transaction.atomic
def change_order_status(order_id: int, new_status: str) -> Order:
    order = Order.objects.select_for_update().filter(pk=order_id).first()
    if not order:
        raise ShopError("Buyurtma topilmadi", 404)
    if new_status == order.status:
        return order
    if new_status not in ALLOWED_TRANSITIONS.get(order.status, set()):
        raise ShopError(
            f"\"{order.get_status_display()}\" holatidagi buyurtmani bu holatga o'tkazib bo'lmaydi", 409,
        )
    if new_status == Order.Status.CANCELED:
        # Bekor qilinganda mahsulot omborga qaytadi
        Product.objects.filter(pk=order.product_id).update(quantity=F('quantity') + order.quantity)
    order.status = new_status
    order.save(update_fields=['status', 'updated_at'])
    return order


@transaction.atomic
def cancel_own_order(user, order_id: int) -> Order:
    order = Order.objects.select_for_update().filter(pk=order_id, user=user).first()
    if not order:
        raise ShopError("Buyurtma topilmadi", 404)
    if order.status != Order.Status.PENDING:
        raise ShopError("Faqat hali qayta ishlanmagan buyurtmani bekor qilish mumkin", 409)
    Product.objects.filter(pk=order.product_id).update(quantity=F('quantity') + order.quantity)
    order.status = Order.Status.CANCELED
    order.save(update_fields=['status', 'updated_at'])
    return order


# ─── To'lovlar (kartaga o'tkazma + chek) ──────────────────

# Bir checkout uchun bir nechta to'lov bo'lsa, qaysi biri ko'rsatilishi (eng muhimi birinchi)
_PAYMENT_PRIORITY = {Payment.PayStatus.COMPLETED: 0, Payment.PayStatus.REVIEW: 1, Payment.PayStatus.CANCELED: 2}


def order_payment_context(orders) -> dict:
    """
    OrderSerializer context'i uchun, buyurtmalar ro'yxatiga bitta so'rov bilan:
    `payment_status` — {checkout_id: status}; `payment_demo` — to'lovi demo bo'lgan checkout'lar.
    """
    ids = {o.checkout_id for o in orders if o.checkout_id}
    statuses: dict = {}
    demo: dict = {}
    if ids:
        rows = Payment.objects.filter(checkout_id__in=ids).order_by().values_list('checkout_id', 'status', 'is_demo')
        for checkout_id, status, is_demo in rows:
            current = statuses.get(checkout_id)
            if current is None or _PAYMENT_PRIORITY.get(status, 9) < _PAYMENT_PRIORITY.get(current, 9):
                statuses[checkout_id] = status
                demo[checkout_id] = is_demo
    return {'payment_status': statuses, 'payment_demo': {cid for cid, flag in demo.items() if flag}}


@transaction.atomic
def create_payment(user, checkout_id, check_photo, card_number: str = '') -> Payment:
    """
    Mijoz o'z checkout'i uchun to'lov chekini yuboradi.
    Summa serverda hisoblanadi; boshqa odamning buyurtmasiga chek yuborib bo'lmaydi (IDOR).
    """
    if not StoreSettings.load().card_payment_enabled:
        raise ShopError("Kartaga o'tkazma orqali to'lov hozircha yoqilmagan")

    # Qulf: bir vaqtda kelgan ikki so'rov ikkita to'lov yaratmasligi uchun
    orders = list(
        Order.objects.select_for_update()
        .filter(user=user, checkout_id=checkout_id)
        .exclude(status=Order.Status.CANCELED)
    )
    if not orders:
        raise ShopError("Buyurtma topilmadi", 404)
    if Payment.objects.filter(
        checkout_id=checkout_id, status__in=(Payment.PayStatus.REVIEW, Payment.PayStatus.COMPLETED),
    ).exists():
        raise ShopError("Bu buyurtma uchun to'lov allaqachon yuborilgan", 409)

    return Payment.objects.create(
        user=user, checkout_id=checkout_id, card_number=card_number,
        amount=sum(o.total_price for o in orders), check_photo=check_photo,
        status=Payment.PayStatus.REVIEW, type=Payment.PayType.MONEY,
    )


@transaction.atomic
def review_payment(payment_id: int, new_status: str, reviewer, note: str = '') -> Payment:
    payment = Payment.objects.select_for_update().filter(pk=payment_id).first()
    if not payment:
        raise ShopError("To'lov topilmadi", 404)
    if new_status not in (Payment.PayStatus.COMPLETED, Payment.PayStatus.CANCELED):
        raise ShopError("Noto'g'ri holat")
    if payment.status != Payment.PayStatus.REVIEW:
        raise ShopError("Bu to'lov allaqachon ko'rib chiqilgan", 409)
    payment.status = new_status
    payment.note = (note or '')[:300]
    payment.reviewed_by = reviewer
    payment.reviewed_at = timezone.now()
    payment.save(update_fields=['status', 'note', 'reviewed_by', 'reviewed_at', 'updated_at'])
    return payment
