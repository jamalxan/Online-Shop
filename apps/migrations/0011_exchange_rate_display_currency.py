"""
Valyuta konvertatsiyasi: dollar kursi, saytning standart ko'rinish valyutasi va buyurtmadagi kurs.

Ilgari `currency` ham "narxlar qaysi valyutada kiritilgan", ham "saytda qanday ko'rinadi" degan ma'noni
bergan va hech narsa qayta hisoblanmagan. Endi bu ikki narsa alohida. Yangilanishdan keyin sayt
avvalgidek ko'rinib turishi uchun eski qiymat `display_currency` ga ham ko'chiriladi; narxlar aslida
qaysi valyutada kiritilganini (va kursni) admin Sozlamalarda o'zi ko'rsatadi.
"""
import django.core.validators
from django.db import migrations, models

CURRENCIES = [("USD", "AQSh dollari ($)"), ("UZS", "O'zbek so'mi (so'm)")]


def forwards(apps, schema_editor):
    StoreSettings = apps.get_model("apps", "StoreSettings")
    for row in StoreSettings.objects.all():
        if row.display_currency != row.currency:
            row.display_currency = row.currency
            row.save(update_fields=["display_currency"])


class Migration(migrations.Migration):

    dependencies = [
        ("apps", "0010_appleshop_rename"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="usd_rate",
            field=models.PositiveIntegerField(default=0, verbose_name="Xarid paytidagi dollar kursi"),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="usd_rate",
            field=models.PositiveIntegerField(
                default=12000,
                validators=[
                    django.core.validators.MinValueValidator(1000),
                    django.core.validators.MaxValueValidator(1000000),
                ],
                verbose_name="Dollar kursi (so'm)",
            ),
        ),
        migrations.AddField(
            model_name="storesettings",
            name="display_currency",
            field=models.CharField(
                choices=CURRENCIES, default="USD", max_length=3, verbose_name="Saytda standart ko'rinish",
            ),
        ),
        migrations.AlterField(
            model_name="storesettings",
            name="currency",
            field=models.CharField(
                choices=CURRENCIES, default="USD", max_length=3, verbose_name="Narxlar valyutasi",
            ),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
