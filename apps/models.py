import uuid
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import AbstractUser, UserManager
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.cache import cache
from django.db.models import Model, ForeignKey, PROTECT, ImageField, TextChoices, CASCADE, SET_NULL, Index, \
    OneToOneField, ManyToManyField, SlugField, UUIDField, EmailField, URLField, GenericIPAddressField
from django.db.models.fields import BigAutoField, CharField, TextField, DecimalField, \
    BooleanField, PositiveIntegerField, PositiveSmallIntegerField, DateTimeField
from django.utils.text import slugify

from apps.storage import private_storage


def apply_discount(price, discount_percent) -> Decimal:
    """Chegirmadan keyingi narx (butun songa yaxlitlangan). Narx hisobining yagona manbai."""
    price = Decimal(price)
    if not discount_percent:
        return price
    discounted = price * (Decimal(100) - Decimal(int(discount_percent))) / Decimal(100)
    return discounted.quantize(Decimal('1'), rounding=ROUND_HALF_UP)


def receipt_upload_path(instance, filename) -> str:
    """To'lov cheklari uchun taxmin qilib bo'lmaydigan fayl nomi."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return f"pays/{uuid.uuid4().hex}.{ext}"


class CustomUserManager(UserManager):
    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Email must be set")
        email = email.strip().lower()
        user = self.model(email=email, **extra_fields)
        user.password = make_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = CharField(max_length=150, unique=True, null=True, blank=True)
    email = CharField(max_length=255, unique=True, null=True, blank=True)
    first_name = CharField(max_length=150, blank=True)
    last_name = CharField(max_length=150, blank=True)
    phone_number = CharField("Telefon raqami", max_length=20, unique=True, null=True, blank=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "Foydalanuvchi"
        verbose_name_plural = "Foydalanuvchilar"


class Category(Model):
    title = CharField(max_length=255)
    photo = ImageField(upload_to="categories/")

    class Meta:
        verbose_name = "Kategoriya"
        verbose_name_plural = "Kategoriyalar"
        ordering = ["id"]

    def __str__(self):
        return self.title


class Product(Model):
    title = CharField(max_length=255)
    slug = SlugField(max_length=300, unique=True, blank=True)
    price = DecimalField("Asosiy narx", max_digits=14, decimal_places=0, validators=[MinValueValidator(0)])
    discount = PositiveSmallIntegerField(
        "Chegirma (%)",
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    description = TextField()
    category = ForeignKey('apps.Category', on_delete=PROTECT)
    quantity = PositiveIntegerField("Ombordagi miqdor", default=0)
    thumbnail_photo = ImageField("Asosiy rasm", upload_to="products/thumbnails/", null=True, blank=True)
    is_active = BooleanField("Faol", default=True)
    created_at = DateTimeField(auto_now_add=True, null=True, blank=True, db_index=True)

    class Meta:
        verbose_name = "Mahsulot"
        verbose_name_plural = "Mahsulotlar"
        ordering = ["-created_at", "-id"]
        indexes = [
            Index(fields=["category", "price"], name="product_cat_price_idx"),
            Index(fields=["price"], name="product_price_idx"),
            Index(fields=["quantity"], name="product_qty_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title) or "product"
            slug = base
            n = 2
            while Product.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{n}"
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def final_price(self) -> Decimal:
        """Ko'rsatiladigan narx: eng arzon xotira varianti (bo'lsa) yoki asosiy narx — chegirma bilan."""
        # .all() prefetch qilingan bo'lsa qo'shimcha so'rov yubormaydi
        options = list(self.storage_options.all())
        base = min((o.price for o in options), default=self.price)
        return apply_discount(base, self.discount)

    def __str__(self):
        return self.title


class ProductPhoto(Model):
    id = BigAutoField(primary_key=True)
    photo = ImageField("Rasm", upload_to="products/")
    product = ForeignKey(
        Product,
        verbose_name="Mahsulot",
        on_delete=CASCADE,
        related_name="photos",
        db_column="product_id",
    )

    class Meta:
        db_table = "product_photos"
        verbose_name = "Mahsulot rasmi"
        verbose_name_plural = "Mahsulot rasmlari"
        ordering = ["id"]


class ColorVariant(Model):
    product = ForeignKey(Product, on_delete=CASCADE, related_name="color_variants")
    name = CharField("Nomi", max_length=100)
    hex_code = CharField("Hex kod", max_length=20)
    order = PositiveSmallIntegerField("Tartib", default=0)

    class Meta:
        verbose_name = "Rang varianti"
        verbose_name_plural = "Rang variantlari"
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.product.title} — {self.name}"


class ColorVariantPhoto(Model):
    variant = ForeignKey(ColorVariant, on_delete=CASCADE, related_name="photos")
    photo = ImageField("Rasm", upload_to="products/colors/")
    order = PositiveSmallIntegerField("Tartib", default=0)

    class Meta:
        verbose_name = "Rang rasmi"
        verbose_name_plural = "Rang rasmlari"
        ordering = ["order", "id"]


class StorageOption(Model):
    product = ForeignKey(Product, on_delete=CASCADE, related_name="storage_options")
    label = CharField("Yorliq", max_length=50)
    storage = CharField("Xotira", max_length=50)
    ram = CharField("RAM", max_length=50, blank=True, default="")
    price = DecimalField("Narx", max_digits=14, decimal_places=0, validators=[MinValueValidator(0)])
    order = PositiveSmallIntegerField("Tartib", default=0)

    class Meta:
        verbose_name = "Xotira varianti"
        verbose_name_plural = "Xotira variantlari"
        ordering = ["order", "id"]

    @property
    def final_price(self) -> Decimal:
        return apply_discount(self.price, self.product.discount)

    def __str__(self):
        return f"{self.product.title} — {self.label}"


class Order(Model):
    class Status(TextChoices):
        PENDING = "pending", "Buyurtma qabul qilinmoqda"
        PREPARING = "preparing", "Buyurtma qadoqlanmoqda"
        SHIPPING = "shipping", "Yetkazilmoqda"
        DELIVERED = "delivered", "Buyurtma egasiga yetkazildi"
        CANCELED = "canceled", "Bekor qilindi"

    class Delivery(TextChoices):
        STANDARD = "standard", "Standart yetkazib berish"
        EXPRESS = "express", "Tezkor yetkazib berish"
        PICKUP = "pickup", "Do'kondan olib ketish"

    # PROTECT: mahsulot o'chirilganda buyurtmalar tarixi yo'qolmasligi kerak
    product = ForeignKey("apps.Product", verbose_name="Mahsulot", on_delete=PROTECT, related_name="orders")
    user = ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=SET_NULL,
        related_name="orders",
        null=True,
        blank=True,
        verbose_name="Foydalanuvchi",
    )
    # Bitta checkout'da yaratilgan barcha buyurtmalar uchun umumiy
    checkout_id = UUIDField("Checkout ID", default=uuid.uuid4, editable=False, db_index=True)
    storage_option = ForeignKey("apps.StorageOption", on_delete=SET_NULL, null=True, blank=True, related_name="+")
    color_variant = ForeignKey("apps.ColorVariant", on_delete=SET_NULL, null=True, blank=True, related_name="+")
    # Sotib olish paytidagi qiymatlar (snapshot): mahsulot keyin o'zgarsa ham buyurtma o'zgarmaydi
    storage_label = CharField("Xotira", max_length=120, blank=True, default="")
    color_name = CharField("Rang", max_length=100, blank=True, default="")
    unit_price = DecimalField("Dona narxi", max_digits=14, decimal_places=0, default=0)
    total_price = DecimalField("Jami narx", max_digits=16, decimal_places=0, default=0)

    first_name = CharField("Ism", max_length=200)
    phone_number = CharField("Telefon raqami", max_length=20)
    address = TextField("Manzil", blank=True, default="")
    delivery_method = CharField("Yetkazish usuli", max_length=20, choices=Delivery.choices, default=Delivery.STANDARD)
    comment = TextField("Izoh", blank=True, default="")
    quantity = PositiveIntegerField("Miqdor", default=1)
    has_discount = BooleanField("Chegirma bilan sotib olinganmi", default=False)
    status = CharField("Holat", max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = DateTimeField("Yaratilgan", auto_now_add=True)
    updated_at = DateTimeField("Yangilangan", auto_now=True)

    class Meta:
        verbose_name = "Buyurtma"
        verbose_name_plural = "Buyurtmalar"
        ordering = ["-created_at", "-id"]
        indexes = [
            Index(fields=["user", "-created_at"], name="order_user_created_idx"),
            Index(fields=["status"], name="order_status_idx"),
            # Admin ro'yxati va statistika sana bo'yicha ishlaydi
            Index(fields=["-created_at"], name="order_created_idx"),
        ]

    def __str__(self):
        return f"Buyurtma #{self.pk}"


class OrderHistory(Order):
    class Meta:
        proxy = True
        verbose_name = "Buyurtma tarixi"
        verbose_name_plural = "Buyurtmalar tarixi"


class Payment(Model):
    class PayStatus(TextChoices):
        REVIEW = "review", "Ko'rib chiqish"
        COMPLETED = "complete", "Yakunlandi"
        CANCELED = "canceled", "Rad etildi"

    class PayType(TextChoices):
        COIN = "coin", "Tanga"
        MONEY = "money", "Pul"

    # To'lov qaysi checkout (buyurtmalar guruhi) uchun ekanini bog'laydi
    checkout_id = UUIDField("Checkout ID", null=True, blank=True, db_index=True)
    # Faqat niqoblangan ko'rinishda saqlanadi (************1234) — to'liq karta raqami saqlanmaydi
    card_number = CharField("Karta raqami", max_length=16, blank=True, default="")
    amount = DecimalField("Miqdor", max_digits=12, decimal_places=0)
    status = CharField("Holat", max_length=20, choices=PayStatus.choices, default=PayStatus.REVIEW)
    # Cheklar ommaviy /media/ ostida EMAS: faqat egasi va admin API orqali ko'radi
    check_photo = ImageField(
        "Chek rasmi", upload_to=receipt_upload_path, storage=private_storage, null=True, blank=True,
    )
    note = CharField("Admin izohi", max_length=300, blank=True, default="")
    reviewed_at = DateTimeField("Ko'rib chiqilgan", null=True, blank=True)
    reviewed_by = ForeignKey(
        'apps.User', verbose_name="Ko'rib chiqdi", on_delete=SET_NULL, related_name="+", null=True, blank=True,
    )
    type = CharField("To'lov turi", max_length=10, choices=PayType.choices, default=PayType.MONEY)
    created_at = DateTimeField("Yaratilgan", auto_now_add=True)
    updated_at = DateTimeField("Yangilangan", auto_now=True)
    user = ForeignKey(
        'apps.User',
        verbose_name="Foydalanuvchi",
        on_delete=SET_NULL,
        related_name="payments",
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = "To'lov"
        verbose_name_plural = "To'lovlar"
        ordering = ["-created_at", "-id"]
        indexes = [Index(fields=["status", "-created_at"], name="payment_status_created_idx")]


class Cart(Model):
    user = OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="cart",
        verbose_name="Foydalanuvchi"
    )
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Savat"
        verbose_name_plural = "Savatlar"

    def __str__(self):
        return f"{self.user.email} savati"


class CartItem(Model):
    cart = ForeignKey(Cart, on_delete=CASCADE, related_name="items", verbose_name="Savat")
    product = ForeignKey("apps.Product", on_delete=CASCADE, related_name="cart_items", verbose_name="Mahsulot")
    storage_option = ForeignKey("apps.StorageOption", on_delete=CASCADE, null=True, blank=True, related_name="+")
    color_variant = ForeignKey("apps.ColorVariant", on_delete=CASCADE, null=True, blank=True, related_name="+")
    quantity = PositiveSmallIntegerField("Miqdor", default=1)
    added_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Savat mahsuloti"
        verbose_name_plural = "Savat mahsulotlari"
        # (cart, product, storage, color) yagonaligi view darajasida ta'minlanadi:
        # NULL qiymatlar sabab DB darajasidagi unique constraint ishonchli emas.
        ordering = ["added_at", "id"]

    @property
    def unit_price(self) -> Decimal:
        base = self.storage_option.price if self.storage_option_id else self.product.price
        return apply_discount(base, self.product.discount)

    @property
    def total(self) -> Decimal:
        return self.unit_price * self.quantity

    def __str__(self):
        return f"{self.product.title} x {self.quantity}"


class Wishlist(Model):
    user = OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=CASCADE,
        related_name="wishlist",
        verbose_name="Foydalanuvchi"
    )
    products = ManyToManyField(
        "apps.Product",
        related_name="wishlisted_by",
        blank=True,
        verbose_name="Mahsulotlar"
    )

    class Meta:
        verbose_name = "Sevimlilar"
        verbose_name_plural = "Sevimlilar"

    def __str__(self):
        return f"{self.user.email} sevimlilar"


# ─── Do'kon sozlamalari, murojaatlar, obuna, audit ────────

STORE_SETTINGS_CACHE_KEY = "store_settings:v1"


def format_money(value, currency: str = 'USD') -> str:
    """Xat va bildirishnomalar uchun: "$1,099" yoki "13 500 000 so'm". Saytdagi format bilan bir xil."""
    amount = int(Decimal(value or 0).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    if currency == 'UZS':
        return f"{amount:,}".replace(',', ' ') + " so'm"
    return f"${amount:,}"


class StoreSettings(Model):
    """
    Yagona qator (pk=1). Aloqa ma'lumotlari va to'lov rekvizitlari kodda emas,
    admin paneldan boshqariladi. Bo'sh maydon saytda umuman ko'rsatilmaydi.
    """
    CURRENCIES = (('USD', 'AQSh dollari ($)'), ('UZS', "O'zbek so'mi (so'm)"))

    store_name = CharField("Do'kon nomi", max_length=100, default="AppleShop")
    # Narxlar qaysi valyutada kiritilgani. O'zgartirish narxlarni qayta hisoblamaydi —
    # faqat saytda va xatlarda qanday ko'rsatilishini belgilaydi.
    currency = CharField("Valyuta", max_length=3, choices=CURRENCIES, default='USD')
    phone = CharField("Telefon", max_length=30, blank=True, default="")
    phone_secondary = CharField("Qo'shimcha telefon", max_length=30, blank=True, default="")
    email = EmailField("Email", max_length=255, blank=True, default="")
    address = CharField("Manzil", max_length=300, blank=True, default="")
    working_hours = CharField("Ish vaqti", max_length=200, blank=True, default="")
    telegram_url = URLField("Telegram", max_length=200, blank=True, default="")
    instagram_url = URLField("Instagram", max_length=200, blank=True, default="")
    delivery_note = CharField("Yetkazib berish haqida", max_length=300, blank=True, default="")
    # Do'konning qabul qiluvchi kartasi. Bo'sh bo'lsa "kartaga o'tkazma" usuli o'chiq.
    payment_card_number = CharField("To'lov kartasi", max_length=19, blank=True, default="")
    payment_card_holder = CharField("Karta egasi", max_length=100, blank=True, default="")
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Do'kon sozlamalari"
        verbose_name_plural = "Do'kon sozlamalari"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
        cache.delete(STORE_SETTINGS_CACHE_KEY)

    def delete(self, *args, **kwargs):  # yagona qator o'chirilmaydi
        return 0, {}

    @classmethod
    def load(cls) -> "StoreSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def card_payment_enabled(self) -> bool:
        return bool(self.payment_card_number.strip())

    def __str__(self):
        return self.store_name


class NewsletterSubscriber(Model):
    email = EmailField(max_length=255, unique=True)
    is_active = BooleanField(default=True)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Obunachi"
        verbose_name_plural = "Obunachilar"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.email


class ContactMessage(Model):
    name = CharField("Ism", max_length=120)
    email = EmailField("Email", max_length=255, blank=True, default="")
    phone = CharField("Telefon", max_length=20, blank=True, default="")
    subject = CharField("Mavzu", max_length=150, blank=True, default="")
    message = TextField("Xabar")
    is_read = BooleanField("O'qilgan", default=False)
    user = ForeignKey(settings.AUTH_USER_MODEL, on_delete=SET_NULL, null=True, blank=True, related_name="+")
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Murojaat"
        verbose_name_plural = "Murojaatlar"
        ordering = ["-created_at", "-id"]
        indexes = [Index(fields=["is_read", "-created_at"], name="contact_read_created_idx")]

    def __str__(self):
        return f"{self.name}: {self.subject or self.message[:40]}"


class AdminAuditLog(Model):
    """Admin paneldagi har bir o'zgartirish: kim, nima, qachon, qaysi IP'dan."""
    actor = ForeignKey(settings.AUTH_USER_MODEL, on_delete=SET_NULL, null=True, blank=True, related_name="+")
    # Hisob o'chirilsa ham yozuv kimga tegishli ekani saqlanadi
    actor_email = CharField(max_length=255, blank=True, default="")
    action = CharField(max_length=60, db_index=True)
    object_type = CharField(max_length=60, blank=True, default="")
    object_id = CharField(max_length=40, blank=True, default="")
    summary = CharField(max_length=300, blank=True, default="")
    ip = GenericIPAddressField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Audit yozuvi"
        verbose_name_plural = "Audit jurnali"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.actor_email} {self.action} {self.object_type}#{self.object_id}"
