"""
Do'kon nomi "APEX Store" -> "AppleShop" va Accessories kategoriyasining rasmi.

Ikkala o'zgarish ham shartli: admin o'zi yozgan nomga yoki o'zi yuklagan rasmga tegilmaydi.

Media papkasi git'da ham, Docker image'da ham yo'q (serverda alohida volume), shuning uchun yangi rasm
kod bilan birga keladi (apps/fixtures/images/) va shu migratsiya uni media omboriga o'zi ko'chiradi.
Ko'chirib bo'lmasa (fayl yo'q, yozish huquqi yo'q) kategoriya eski rasmi bilan qoladi — rasmsiz emas.

Ichki nomlar (Redis prefiksi, /srv/apexstore, compose loyiha nomi) ataylab o'zgarmaydi: ularni
almashtirish ishlab turgan serverdagi ma'lumotlar bilan aloqani uzadi.
"""
from pathlib import Path

from django.core.files import File
from django.core.files.storage import default_storage
from django.db import migrations, models

OLD_STORE_NAMES = ("APEX Store", "APEX")
NEW_STORE_NAME = "AppleShop"

ACCESSORIES_TITLE = "Accessories"
OLD_ACCESSORIES_PHOTO = "categories/img_4.png"        # stok saytdan olingan, suv belgili piktogrammalar
NEW_ACCESSORIES_PHOTO = "categories/accessories.jpg"   # do'konning o'z aksessuarlari
SEED_PHOTO = Path(__file__).resolve().parent.parent / "fixtures" / "images" / "accessories.jpg"


def install_new_photo():
    """Yangi rasmni media omboriga qo'yadi va uning nomini qaytaradi; iloji bo'lmasa None."""
    try:
        if default_storage.exists(NEW_ACCESSORIES_PHOTO):
            return NEW_ACCESSORIES_PHOTO
        with SEED_PHOTO.open("rb") as handle:
            return default_storage.save(NEW_ACCESSORIES_PHOTO, File(handle))
    except OSError:
        return None


def forwards(apps, schema_editor):
    StoreSettings = apps.get_model("apps", "StoreSettings")
    StoreSettings.objects.filter(store_name__in=OLD_STORE_NAMES).update(store_name=NEW_STORE_NAME)

    Category = apps.get_model("apps", "Category")
    stale = Category.objects.filter(title__iexact=ACCESSORIES_TITLE, photo=OLD_ACCESSORIES_PHOTO)
    if stale.exists():
        photo = install_new_photo()
        if photo:
            stale.update(photo=photo)


def backwards(apps, schema_editor):
    StoreSettings = apps.get_model("apps", "StoreSettings")
    StoreSettings.objects.filter(store_name=NEW_STORE_NAME).update(store_name=OLD_STORE_NAMES[0])

    Category = apps.get_model("apps", "Category")
    Category.objects.filter(
        title__iexact=ACCESSORIES_TITLE, photo=NEW_ACCESSORIES_PHOTO,
    ).update(photo=OLD_ACCESSORIES_PHOTO)


class Migration(migrations.Migration):

    dependencies = [
        ("apps", "0009_store_currency"),
    ]

    operations = [
        migrations.AlterField(
            model_name="storesettings",
            name="store_name",
            field=models.CharField(default="AppleShop", max_length=100, verbose_name="Do'kon nomi"),
        ),
        migrations.RunPython(forwards, backwards),
    ]
