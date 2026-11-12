"""Ommaga ochiq bo'lmagan fayllar (to'lov cheklari) uchun alohida saqlash joyi."""
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible


@deconstructible
class PrivateStorage(FileSystemStorage):
    """
    MEDIA_ROOT'dan tashqarida saqlaydi, shuning uchun nginx /media/ ni ochiq
    tarqatsa ham bu fayllar URL orqali olinmaydi — faqat ruxsatni tekshiradigan
    API view (`PaymentReceiptAPIView`) orqali beriladi.
    """

    def __init__(self):
        super().__init__(location=None, base_url=None)

    @property
    def base_location(self):
        return str(settings.PRIVATE_MEDIA_ROOT)

    @property
    def location(self):
        return str(settings.PRIVATE_MEDIA_ROOT)

    def url(self, name):  # to'g'ridan-to'g'ri URL yo'q
        raise ValueError("Bu fayl faqat himoyalangan API orqali beriladi")


private_storage = PrivateStorage()
