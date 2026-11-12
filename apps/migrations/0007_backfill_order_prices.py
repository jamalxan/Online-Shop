import uuid
from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations


def backfill(apps, schema_editor):
    """
    Mavjud yozuvlarni yangi maydonlarga moslaydi:
      * buyurtmalarga narx snapshot'i (mahsulotning hozirgi narxidan — aniqroq ma'lumot yo'q);
      * har bir eski buyurtmaga alohida checkout_id (AddField hammaga bitta qiymat beradi);
      * saqlangan to'liq karta raqamlari niqoblanadi.
    """
    Order = apps.get_model('apps', 'Order')
    Payment = apps.get_model('apps', 'Payment')

    for order in Order.objects.select_related('product').iterator():
        price = Decimal(order.product.price)
        if order.has_discount and order.product.discount:
            price = (price * (100 - order.product.discount) / Decimal(100)).quantize(
                Decimal('1'), rounding=ROUND_HALF_UP,
            )
        order.unit_price = price
        order.total_price = price * order.quantity
        order.checkout_id = uuid.uuid4()
        order.save(update_fields=['unit_price', 'total_price', 'checkout_id'])

    for payment in Payment.objects.iterator():
        digits = ''.join(ch for ch in payment.card_number if ch.isdigit())
        masked = '*' * 12 + digits[-4:].rjust(4, '*')
        if payment.card_number != masked:
            payment.card_number = masked
            payment.save(update_fields=['card_number'])


class Migration(migrations.Migration):

    dependencies = [
        ('apps', '0006_variants_order_snapshot'),
    ]

    operations = [
        # Karta raqamini niqoblash qaytarilmaydi; orqaga migratsiya ma'lumotga tegmaydi
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
