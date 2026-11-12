import re
import time

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, Throttled
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer

from apps import otp
from apps.models import (
    User, Category, Product, ProductPhoto, ColorVariant, ColorVariantPhoto, StorageOption,
    Cart, CartItem, Wishlist, Order, Payment, StoreSettings, ContactMessage,
)
from apps.utils import client_ip

OTP_REGISTER = 'register'
OTP_RESET = 'reset'

ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
PHONE_RE = re.compile(r'^\+?\d{9,15}$')
HEX_RE = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$')

LOGIN_MAX_FAILURES = 10           # bitta IP'dan bitta hisobga
LOGIN_GLOBAL_MAX_FAILURES = 50    # barcha IP'lardan bitta hisobga (taqsimlangan hujum)
LOGIN_LOCK_TTL = 15 * 60


# ─── Umumiy validatorlar ──────────────────────────────────

def validate_image(file):
    """Rasm hajmi va kengaytmasini tekshiradi (tarkibini ImageField Pillow orqali tekshiradi)."""
    if file.size > settings.MAX_IMAGE_UPLOAD_SIZE:
        limit_mb = settings.MAX_IMAGE_UPLOAD_SIZE // (1024 * 1024)
        raise serializers.ValidationError(f"Rasm hajmi {limit_mb} MB dan oshmasligi kerak")
    ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else ''
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise serializers.ValidationError("Faqat JPG, PNG yoki WEBP rasm yuklash mumkin")
    return file


def clean_phone(value: str) -> str:
    phone = re.sub(r'[\s\-()]', '', value or '')
    if not PHONE_RE.match(phone):
        raise serializers.ValidationError("Telefon raqami noto'g'ri formatda (masalan: +998901234567)")
    return phone


def run_password_validators(password: str, user=None) -> None:
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages))


class NormalizedEmailField(serializers.EmailField):
    def to_internal_value(self, data):
        return super().to_internal_value(data).strip().lower()


# ─── Auth ─────────────────────────────────────────────────

class EmailVerifySerializer(serializers.Serializer):
    email = NormalizedEmailField(max_length=255)


class VerifyOtpCodeSerializer(serializers.Serializer):
    email = NormalizedEmailField(max_length=255)
    code = serializers.RegexField(r'^\d{6}$', error_messages={'invalid': "Kod 6 ta raqamdan iborat bo'lishi kerak"})


class ForgotPasswordSerializer(serializers.Serializer):
    email = NormalizedEmailField(max_length=255)


class ForgotPasswordVerifySerializer(VerifyOtpCodeSerializer):
    pass


class ResetPasswordSerializer(serializers.Serializer):
    email = NormalizedEmailField(max_length=255)
    new_password = serializers.CharField(min_length=8, max_length=128, write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(min_length=8, max_length=128, write_only=True, trim_whitespace=False)

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'error': "Parollar mos kelmadi!"})
        if not otp.has_grant(OTP_RESET, data['email']):
            raise serializers.ValidationError({'error': "Email tasdiqlanmagan yoki muddat tugagan!"})
        user = User.objects.filter(email__iexact=data['email']).first()
        run_password_validators(data['new_password'], user=user)
        data['user'] = user
        return data


class UserModelSerializer(serializers.ModelSerializer):
    """Ro'yxatdan o'tish. Email avval OTP bilan tasdiqlangan bo'lishi shart."""
    email = NormalizedEmailField(max_length=255)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128, trim_whitespace=False)
    username = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = User
        fields = ('id', 'first_name', 'last_name', 'username', 'email', 'phone_number', 'password')
        read_only_fields = ('id',)

    def validate_email(self, email):
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Bu email bilan foydalanuvchi allaqachon mavjud")
        if not otp.has_grant(OTP_REGISTER, email):
            raise serializers.ValidationError("Tasdiqlanmagan email kiritildi")
        return email

    def validate_username(self, username):
        username = (username or '').strip() or None
        if username and User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Bu username band")
        return username

    def validate_phone_number(self, phone):
        if not phone:
            return None
        phone = clean_phone(phone)
        if User.objects.filter(phone_number=phone).exists():
            raise serializers.ValidationError("Bu telefon raqami allaqachon ro'yxatdan o'tgan")
        return phone

    def validate(self, attrs):
        candidate = User(
            email=attrs.get('email'), username=attrs.get('username'),
            first_name=attrs.get('first_name', ''), last_name=attrs.get('last_name', ''),
        )
        try:
            validate_password(attrs['password'], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        email = validated_data.pop('email')
        user = User.objects.create_user(email=email, password=password, **validated_data)
        otp.consume_grant(OTP_REGISTER, email)
        return user


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'email'

    def validate(self, attrs):
        email = otp.normalize(attrs.get('email'))
        password = attrs.get('password')

        # Blok IP + email bo'yicha: begona odam ataylab xato parol kiritib, haqiqiy egasini
        # o'z hisobidan mahrum qila olmaydi. Umumiy (barcha IP) limit ancha yuqori.
        request = self.context.get('request')
        ip = client_ip(request) if request is not None else ''
        fail_key = f"login_fail:{otp._key('x', f'ip:{ip}', email)}"
        global_key = f"login_fail_all:{otp._key('x', 'login', email)}"
        if (cache.get(fail_key) or 0) >= LOGIN_MAX_FAILURES \
                or (cache.get(global_key) or 0) >= LOGIN_GLOBAL_MAX_FAILURES:
            raise Throttled(detail="Juda ko'p noto'g'ri urinish. 15 daqiqadan keyin qayta urinib ko'ring.")

        # Eski yozuvlarda email registri har xil bo'lishi mumkin
        stored_email = (
            User.objects.filter(email__iexact=email).values_list('email', flat=True).first() or email
        )
        # ModelBackend is_active=False foydalanuvchini rad etadi
        user = authenticate(request=self.context.get('request'), username=stored_email, password=password)
        if not user:
            otp._incr(fail_key, LOGIN_LOCK_TTL)
            otp._incr(global_key, LOGIN_LOCK_TTL)
            raise serializers.ValidationError({'detail': 'Email yoki parol xato!'})

        cache.delete(fail_key)

        if user.is_staff and settings.ADMIN_OTP_REQUIRED:
            raise PermissionDenied(
                detail="Admin hisoblar faqat admin panel orqali (email kod bilan) kiradi.",
                code='admin_otp_required',
            )

        # View refresh tokenni httpOnly cookie'ga joylaydi — javob tanasiga chiqmaydi
        return {'refresh_token': self.get_token(user)}


class SessionAwareTokenRefreshSerializer(TokenRefreshSerializer):
    """
    Admin sessiyasiga mutlaq muddat qo'yadi. Refresh token har yangilanganda aylanadi
    (va muddati uzayadi), lekin `adm` belgili tokenlar birinchi kirishdan
    ADMIN_SESSION_HOURS soat o'tgach qabul qilinmaydi — o'g'irlangan admin token
    cheksiz yashay olmaydi.
    """

    def validate(self, attrs):
        token = self.token_class(attrs['refresh'])
        if token.get('adm'):
            started = int(token.get('sess', 0) or 0)
            if time.time() - started > settings.ADMIN_SESSION_HOURS * 3600:
                raise InvalidToken("Admin sessiyasi muddati tugadi. Qaytadan kiring.")
        return super().validate(attrs)


# ─── Katalog ──────────────────────────────────────────────

class ProductPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductPhoto
        fields = ('id', 'photo')


class ColorVariantPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ColorVariantPhoto
        fields = ('id', 'photo', 'order')


class ColorVariantSerializer(serializers.ModelSerializer):
    photos = ColorVariantPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = ColorVariant
        fields = ('id', 'name', 'hex_code', 'photos', 'order')


class ColorVariantBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = ColorVariant
        fields = ('id', 'name', 'hex_code')


class StorageOptionSerializer(serializers.ModelSerializer):
    final_price = serializers.DecimalField(max_digits=14, decimal_places=0, read_only=True)

    class Meta:
        model = StorageOption
        fields = ('id', 'label', 'storage', 'ram', 'price', 'final_price', 'order')


class ProductListSerializer(serializers.ModelSerializer):
    final_price = serializers.DecimalField(max_digits=14, decimal_places=0, read_only=True)
    category = serializers.StringRelatedField()
    category_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Product
        fields = (
            'id', 'title', 'slug', 'price', 'final_price', 'discount', 'thumbnail_photo',
            'quantity', 'is_active', 'category', 'category_id', 'created_at',
        )


class ProductDetailSerializer(serializers.ModelSerializer):
    photos = ProductPhotoSerializer(many=True, read_only=True)
    color_variants = ColorVariantSerializer(many=True, read_only=True)
    storage_options = StorageOptionSerializer(many=True, read_only=True)
    category = serializers.StringRelatedField()
    category_id = serializers.IntegerField(read_only=True)
    final_price = serializers.DecimalField(max_digits=14, decimal_places=0, read_only=True)

    class Meta:
        model = Product
        fields = (
            'id', 'title', 'slug', 'price', 'final_price', 'discount', 'description',
            'category', 'category_id', 'quantity', 'thumbnail_photo', 'photos',
            'color_variants', 'storage_options', 'is_active', 'created_at',
        )


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ('id', 'title', 'photo')


class PublicCategorySerializer(serializers.ModelSerializer):
    # view'da annotate(product_count=...) bilan hisoblanadi (faqat faol mahsulotlar)
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ('id', 'title', 'photo', 'product_count')


class ProductSearchSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, allow_blank=True, max_length=100)


# ─── Profil ───────────────────────────────────────────────

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'first_name', 'last_name', 'email', 'phone_number', 'username', 'is_staff')
        # email/telefon tasdiqlashsiz o'zgartirilmaydi (hisobni egallab olishdan himoya)
        read_only_fields = ('id', 'email', 'phone_number', 'is_staff')

    def validate_username(self, username):
        username = (username or '').strip() or None
        if username and User.objects.filter(username__iexact=username).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("Bu username band")
        return username


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, min_length=8, max_length=128, trim_whitespace=False)

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'error': "Parollar mos kelmadi!"})
        run_password_validators(data['new_password'], user=self.context.get('user'))
        return data


# ─── Savat ────────────────────────────────────────────────

class CartItemSerializer(serializers.ModelSerializer):
    product = ProductListSerializer(read_only=True)
    storage_option = StorageOptionSerializer(read_only=True)
    color_variant = ColorVariantBriefSerializer(read_only=True)
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=0, read_only=True)
    total = serializers.DecimalField(max_digits=16, decimal_places=0, read_only=True)

    class Meta:
        model = CartItem
        fields = ('id', 'product', 'storage_option', 'color_variant', 'quantity', 'unit_price', 'total', 'added_at')


class CartItemCreateSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=100, default=1)
    storage_option_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    color_variant_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)


class CartItemUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=100)


class CartSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()
    total_price = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ('id', 'items', 'total_price', 'items_count', 'updated_at')

    def _items(self, obj):
        if not hasattr(obj, '_cached_items'):
            obj._cached_items = list(
                obj.items.select_related('product__category', 'storage_option__product', 'color_variant')
                .prefetch_related('product__storage_options')
            )
        return obj._cached_items

    def get_items(self, obj) -> list:
        return CartItemSerializer(self._items(obj), many=True, context=self.context).data

    def get_total_price(self, obj) -> str:
        return str(sum((item.total for item in self._items(obj)), 0))

    def get_items_count(self, obj) -> int:
        return len(self._items(obj))


class WishlistSerializer(serializers.ModelSerializer):
    products = serializers.SerializerMethodField()

    class Meta:
        model = Wishlist
        fields = ('id', 'products')

    def get_products(self, obj) -> list:
        qs = obj.products.filter(is_active=True).select_related('category').prefetch_related('storage_options')
        return ProductListSerializer(qs, many=True, context=self.context).data


# ─── Buyurtma va to'lov ───────────────────────────────────

class OrderSerializer(serializers.ModelSerializer):
    product = ProductListSerializer(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    delivery_display = serializers.CharField(source='get_delivery_method_display', read_only=True)
    payment_status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            'id', 'checkout_id', 'product', 'first_name', 'phone_number', 'address',
            'delivery_method', 'delivery_display', 'comment',
            'quantity', 'unit_price', 'total_price', 'storage_label', 'color_name',
            'has_discount', 'status', 'status_display', 'payment_status', 'created_at', 'updated_at',
        )

    def get_payment_status(self, obj) -> str | None:
        """Shu checkout uchun yuborilgan to'lov holati (view context'da bitta so'rov bilan yuklanadi)."""
        return (self.context.get('payment_status') or {}).get(obj.checkout_id)


class AdminOrderSerializer(OrderSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True, default=None)
    user_id = serializers.IntegerField(read_only=True)

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + ('user_email', 'user_id')


class OrderCreateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=200)
    phone_number = serializers.CharField(max_length=20)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
    delivery_method = serializers.ChoiceField(choices=Order.Delivery.choices, default=Order.Delivery.STANDARD)
    comment = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
    from_cart = serializers.BooleanField(default=False)
    product_id = serializers.IntegerField(min_value=1, required=False)
    quantity = serializers.IntegerField(min_value=1, max_value=100, default=1)
    storage_option_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    color_variant_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    def validate_phone_number(self, value):
        return clean_phone(value)

    def validate(self, data):
        if not data.get('from_cart') and not data.get('product_id'):
            raise serializers.ValidationError({'error': 'product_id yoki from_cart talab qilinadi'})
        if data['delivery_method'] != Order.Delivery.PICKUP and not data.get('address', '').strip():
            raise serializers.ValidationError({'error': 'Yetkazib berish uchun manzil kiritilishi shart'})
        return data


class PaymentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    receipt_url = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            'id', 'checkout_id', 'card_number', 'amount', 'status', 'status_display',
            'note', 'receipt_url', 'created_at', 'reviewed_at',
        )

    def get_receipt_url(self, obj) -> str | None:
        # Chek ommaviy /media/ da emas — faqat egasi yoki admin tokeni bilan olinadi
        if not obj.check_photo:
            return None
        path = f"/api/payments/{obj.pk}/receipt/"
        request = self.context.get('request')
        return request.build_absolute_uri(path) if request else path


class PaymentCreateSerializer(serializers.Serializer):
    """
    Kartaga o'tkazma cheki. Summa mijozdan OLINMAYDI — serverda buyurtmalardan hisoblanadi.
    """
    checkout_id = serializers.UUIDField()
    check_photo = serializers.ImageField(validators=[validate_image])
    # ixtiyoriy: to'lov qilingan karta (19 gacha — bo'shliqlar bilan kiritilgan raqam uchun)
    card_number = serializers.CharField(max_length=19, required=False, allow_blank=True, default='')

    def validate_card_number(self, value):
        digits = re.sub(r'[\s\-]', '', value or '')
        if not digits:
            return ''
        if not re.fullmatch(r'\d{16}', digits):
            raise serializers.ValidationError("Karta raqami 16 ta raqamdan iborat bo'lishi kerak")
        # To'liq karta raqami saqlanmaydi — faqat oxirgi 4 ta raqam
        return '*' * 12 + digits[-4:]


# ─── Do'kon ma'lumotlari, obuna, murojaat ─────────────────

class StoreInfoSerializer(serializers.ModelSerializer):
    """Saytda ko'rsatiladigan ochiq ma'lumot."""
    card_payment = serializers.SerializerMethodField()

    class Meta:
        model = StoreSettings
        fields = (
            'store_name', 'currency', 'phone', 'phone_secondary', 'email', 'address', 'working_hours',
            'telegram_url', 'instagram_url', 'delivery_note', 'card_payment',
        )

    def get_card_payment(self, obj) -> dict | None:
        if not obj.card_payment_enabled:
            return None
        return {'card_number': obj.payment_card_number, 'card_holder': obj.payment_card_holder}


class NewsletterSerializer(serializers.Serializer):
    email = NormalizedEmailField(max_length=255)


class ContactMessageCreateSerializer(serializers.ModelSerializer):
    email = NormalizedEmailField(max_length=255, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    # Bot tuzog'i: odam ko'rmaydigan maydon. To'ldirilgan bo'lsa xabar saqlanmaydi.
    website = serializers.CharField(required=False, allow_blank=True, write_only=True, max_length=200)

    class Meta:
        model = ContactMessage
        fields = ('name', 'email', 'phone', 'subject', 'message', 'website')
        extra_kwargs = {
            'name': {'max_length': 120},
            'subject': {'required': False, 'allow_blank': True, 'max_length': 150},
            'message': {'max_length': 3000, 'min_length': 5},
        }

    def validate_phone(self, value):
        return clean_phone(value) if value else ''

    def validate(self, data):
        if not data.get('email') and not data.get('phone'):
            raise serializers.ValidationError({'error': "Javob berishimiz uchun email yoki telefon kiriting"})
        return data
