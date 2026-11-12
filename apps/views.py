import logging
import mimetypes

from django.db.models import Count, Q
from django.http import FileResponse
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers, status
from rest_framework.exceptions import NotAuthenticated
from rest_framework.generics import CreateAPIView, ListAPIView, RetrieveAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps import notifications, otp, services
from apps.auth_cookies import (
    clear_refresh_cookie, enforce_trusted_origin, no_store, read_refresh_cookie, set_refresh_cookie,
    token_response,
)
from apps.models import (
    AdminAuditLog, Product, Category, User, CartItem, Wishlist, Order, Payment, StoreSettings,
)
from apps.send_message import send_email
from apps.utils import client_ip
from apps.serializers import (
    OTP_REGISTER, OTP_RESET,
    ProductListSerializer, ProductDetailSerializer, UserModelSerializer,
    EmailVerifySerializer, VerifyOtpCodeSerializer, ForgotPasswordSerializer, ForgotPasswordVerifySerializer,
    ResetPasswordSerializer, PublicCategorySerializer, ProductSearchSerializer, ChangePasswordSerializer,
    ProfileSerializer, CartSerializer, CartItemCreateSerializer, CartItemUpdateSerializer,
    WishlistSerializer, OrderSerializer, OrderCreateSerializer, PaymentSerializer, PaymentCreateSerializer,
    EmailTokenObtainPairSerializer, SessionAwareTokenRefreshSerializer,
)

logger = logging.getLogger(__name__)


def error_response(exc) -> Response:
    """OtpError / ShopError -> {'error': ...}"""
    return Response({'error': exc.message}, status=exc.status)


def revoke_refresh_tokens(user) -> None:
    """Foydalanuvchining barcha refresh tokenlarini bekor qiladi (parol o'zgarganda, hisob bloklanganda)."""
    tokens = OutstandingToken.objects.filter(user=user, blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in tokens], ignore_conflicts=True,
    )


def order_context(request, orders) -> dict:
    """OrderSerializer uchun context: to'lov holatlari bitta so'rov bilan."""
    return {
        'request': request,
        'payment_status': services.payment_status_by_checkout(o.checkout_id for o in orders),
    }


def active_products():
    return (
        Product.objects.filter(is_active=True)
        .select_related('category')
        .prefetch_related('storage_options')
    )


# ─── Auth ─────────────────────────────────────────────────

@extend_schema(tags=['Auth'])
class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    throttle_scope = 'login'

    @extend_schema(
        responses={200: inline_serializer('AccessToken', {'access': drf_serializers.CharField()})},
        summary="Kirish (access token tanada, refresh token httpOnly cookie'da)",
    )
    def post(self, request, *args, **kwargs):
        enforce_trusted_origin(request)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return token_response(serializer.validated_data['refresh_token'])


@extend_schema(tags=['Auth'])
class CookieTokenRefreshView(APIView):
    """
    Cookie'dagi refresh token evaziga yangi access token beradi. Refresh token har safar
    aylanadi (eskisi qora ro'yxatga tushadi) va yangisi yana cookie'ga yoziladi.
    """
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_scope = 'token_refresh'

    def get_authenticate_header(self, request):
        # Autentifikator yo'q view'da DRF 401 ni 403 ga aylantiradi; frontend esa aynan
        # 401 ni "sessiya tugadi" deb tushunadi
        return 'Bearer realm="api"'

    @extend_schema(
        request=None,
        responses={200: inline_serializer('RefreshedAccessToken', {'access': drf_serializers.CharField()})},
        summary="Access tokenni yangilash (cookie orqali)",
    )
    def post(self, request):
        enforce_trusted_origin(request)
        raw = read_refresh_cookie(request)
        if not raw:
            raise NotAuthenticated("Sessiya topilmadi. Qaytadan kiring.")
        serializer = SessionAwareTokenRefreshSerializer(data={'refresh': raw})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            # Cookie bu yerda o'chirilmaydi: ikki varaq bir vaqtda yangilasa, kechikkan javob
            # boshqa varaq hozirgina olgan yangi cookie'ni o'chirib yuborishi mumkin edi
            raise InvalidToken(exc.args[0]) from exc
        data = serializer.validated_data
        response = no_store(Response({'access': data['access']}))
        if 'refresh' in data:
            set_refresh_cookie(response, RefreshToken(data['refresh'], verify=False))
        return response


@extend_schema(tags=['Auth'])
class LogoutAPIView(APIView):
    """
    Refresh tokenni serverda bekor qiladi va cookie'ni o'chiradi. Busiz "chiqish" faqat
    brauzerdagi nusxani o'chirar edi va o'g'irlangan token 7 kun davomida ishlayverardi.
    """
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_scope = 'login'

    @extend_schema(request=None, responses={200: None}, summary="Chiqish (refresh tokenni bekor qilish)")
    def post(self, request):
        enforce_trusted_origin(request)
        raw = read_refresh_cookie(request)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass  # allaqachon yaroqsiz — natija bir xil
        response = Response({'message': 'Chiqildi'})
        clear_refresh_cookie(response)
        return response


@extend_schema(tags=['Auth'])
class RegisterAPIView(CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserModelSerializer
    permission_classes = (AllowAny,)
    throttle_scope = 'register'


@extend_schema(tags=['Auth'])
class VerifyEmailAPIView(APIView):
    permission_classes = (AllowAny,)
    throttle_scope = 'otp_send'

    @extend_schema(request=EmailVerifySerializer, responses={200: None}, summary="Email ga OTP kod yuborish")
    def post(self, request):
        serializer = EmailVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {'email': ["Bu email bilan foydalanuvchi allaqachon mavjud"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            code = otp.issue(OTP_REGISTER, email)
        except otp.OtpError as exc:
            return error_response(exc)

        if not send_email(email, code):
            return Response(
                {'error': "Email yuborib bo'lmadi. Keyinroq urinib ko'ring."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({'message': 'Tasdiqlash kodi emailga yuborildi!'})


@extend_schema(tags=['Auth'])
class VerifyOtpAPIView(APIView):
    permission_classes = (AllowAny,)
    throttle_scope = 'otp_verify'

    @extend_schema(request=VerifyOtpCodeSerializer, responses={200: None}, summary="OTP kodni tasdiqlash")
    def post(self, request):
        serializer = VerifyOtpCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        try:
            otp.verify(OTP_REGISTER, email, serializer.validated_data['code'])
        except otp.OtpError as exc:
            return error_response(exc)
        otp.grant(OTP_REGISTER, email)
        return Response({'message': 'OTP kod muvaffaqiyatli tasdiqlandi!'})


@extend_schema(tags=['Auth'])
class ForgotPasswordAPIView(APIView):
    permission_classes = (AllowAny,)
    throttle_scope = 'otp_send'

    @extend_schema(request=ForgotPasswordSerializer, responses={200: None},
                   summary="Parolni tiklash uchun kod yuborish")
    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        try:
            otp.check_can_send(OTP_RESET, email)
        except otp.OtpError as exc:
            return error_response(exc)

        # Email mavjud yoki yo'qligini oshkor qilmaslik uchun javob har doim bir xil
        if User.objects.filter(email__iexact=email, is_active=True).exists():
            code = otp.issue(OTP_RESET, email, enforce_limits=False)
            send_email(email, code, subject="Parolni tiklash kodi")

        return Response({'message': "Agar bu email ro'yxatdan o'tgan bo'lsa, tasdiqlash kodi yuborildi."})


@extend_schema(tags=['Auth'])
class ForgotPasswordVerifyAPIView(APIView):
    permission_classes = (AllowAny,)
    throttle_scope = 'otp_verify'

    @extend_schema(request=ForgotPasswordVerifySerializer, responses={200: None},
                   summary="Parolni tiklash kodini tasdiqlash")
    def post(self, request):
        serializer = ForgotPasswordVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        try:
            otp.verify(OTP_RESET, email, serializer.validated_data['code'])
        except otp.OtpError as exc:
            return error_response(exc)
        otp.grant(OTP_RESET, email)
        return Response({'message': "Kod tasdiqlandi! Yangi parol o'rnating."})


@extend_schema(tags=['Auth'])
class ResetPasswordAPIView(APIView):
    permission_classes = (AllowAny,)
    throttle_scope = 'otp_verify'

    @extend_schema(request=ResetPasswordSerializer, responses={200: None}, summary="Yangi parol o'rnatish")
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        user = serializer.validated_data['user']
        if not user:
            return Response({'error': 'Foydalanuvchi topilmadi!'}, status=status.HTTP_404_NOT_FOUND)

        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        otp.consume_grant(OTP_RESET, email)
        revoke_refresh_tokens(user)
        logger.info("Parol tiklandi: user_id=%s", user.pk)
        return Response({'message': "Parol muvaffaqiyatli o'zgartirildi!"})


# ─── Katalog ──────────────────────────────────────────────

@extend_schema(tags=['Products'], summary="Mahsulot tafsiloti")
class ProductDetailAPIView(RetrieveAPIView):
    permission_classes = (AllowAny,)
    serializer_class = ProductDetailSerializer

    def get_queryset(self):
        return active_products().prefetch_related('photos', 'color_variants__photos')


@extend_schema(tags=['Products'], parameters=[ProductSearchSerializer], summary="Mahsulot qidirish")
class ProductSearchAPIView(ListAPIView):
    permission_classes = (AllowAny,)
    serializer_class = ProductListSerializer

    def get_queryset(self):
        serializer = ProductSearchSerializer(data=self.request.query_params)
        serializer.is_valid(raise_exception=True)
        title = serializer.validated_data.get('title', '').strip()
        if not title:
            return Product.objects.none()
        return active_products().filter(title__icontains=title)[:50]


def categories_with_counts():
    return Category.objects.annotate(
        product_count=Count('product', filter=Q(product__is_active=True)),
    )


@extend_schema(tags=['Categories'], summary="Kategoriyalar (faol mahsulotlar soni bilan)")
class CategoryListAPIView(ListAPIView):
    permission_classes = (AllowAny,)
    serializer_class = PublicCategorySerializer

    def get_queryset(self):
        return categories_with_counts()


@extend_schema(tags=['Categories'], summary="Kategoriya (mahsulotlari: /api/products/?category=<id>)")
class CategoryDetailAPIView(RetrieveAPIView):
    permission_classes = (AllowAny,)
    serializer_class = PublicCategorySerializer

    def get_queryset(self):
        return categories_with_counts()


# ─── Profil ───────────────────────────────────────────────

@extend_schema(tags=['Profile'])
class ProfileAPIView(RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer
    permission_classes = (IsAuthenticated,)
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_object(self):
        return self.request.user


@extend_schema(tags=['Profile'])
class ChangePasswordAPIView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = 'otp_verify'

    @extend_schema(request=ChangePasswordSerializer, responses={200: None}, summary="Parolni o'zgartirish")
    def post(self, request):
        user = request.user
        serializer = ChangePasswordSerializer(data=request.data, context={'user': user})
        serializer.is_valid(raise_exception=True)

        if not user.check_password(serializer.validated_data['old_password']):
            return Response({'error': "Eski parol noto'g'ri!"}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])

        # Boshqa qurilmalardagi sessiyalar bekor qilinadi, joriy qurilma yangi token oladi
        revoke_refresh_tokens(user)
        refresh = RefreshToken.for_user(user)
        token = request.auth
        if token is not None and token.get('adm'):
            # Admin sessiyasi belgisi va boshlanish vaqti saqlanadi: aks holda parolini almashtirgan
            # admin mutlaq muddati (ADMIN_SESSION_HOURS) yo'q oddiy sessiyaga o'tib qolardi
            refresh['adm'] = True
            refresh['sess'] = token.get('sess')
        if user.is_staff:
            AdminAuditLog.objects.create(
                actor=user, actor_email=user.email or '', action='account.password',
                summary="Parol almashtirildi", ip=client_ip(request) or None,
            )
        return token_response(refresh, {'message': "Parol muvaffaqiyatli o'zgartirildi!"})


# ─── Savat ────────────────────────────────────────────────

@extend_schema(tags=['Cart'])
class CartAPIView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=CartSerializer, summary="Savatni ko'rish")
    def get(self, request):
        cart = services.get_cart(request.user)
        return Response(CartSerializer(cart, context={'request': request}).data)

    @extend_schema(request=CartItemCreateSerializer, responses=CartSerializer, summary="Savatga mahsulot qo'shish")
    def post(self, request):
        serializer = CartItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            cart = services.add_to_cart(
                request.user, d['product_id'], d['quantity'],
                d.get('storage_option_id'), d.get('color_variant_id'),
            )
        except services.ShopError as exc:
            return error_response(exc)
        return Response(CartSerializer(cart, context={'request': request}).data)

    @extend_schema(summary="Savatni tozalash")
    def delete(self, request):
        services.get_cart(request.user).items.all().delete()
        return Response({'message': 'Savat tozalandi!'})


@extend_schema(tags=['Cart'])
class CartItemAPIView(APIView):
    permission_classes = (IsAuthenticated,)

    def get_item(self, pk, user):
        # cart__user filtri: boshqa foydalanuvchi savatiga kirish (IDOR) mumkin emas
        return CartItem.objects.filter(pk=pk, cart__user=user).select_related('product', 'cart').first()

    @extend_schema(request=CartItemUpdateSerializer, responses=CartSerializer, summary="Miqdorni o'zgartirish")
    def patch(self, request, pk):
        item = self.get_item(pk, request.user)
        if not item:
            return Response({'error': 'Topilmadi!'}, status=status.HTTP_404_NOT_FOUND)
        serializer = CartItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cart = services.update_cart_item(item, serializer.validated_data['quantity'])
        except services.ShopError as exc:
            return error_response(exc)
        return Response(CartSerializer(cart, context={'request': request}).data)

    @extend_schema(responses=CartSerializer, summary="Savatdan mahsulotni o'chirish")
    def delete(self, request, pk):
        item = self.get_item(pk, request.user)
        if not item:
            return Response({'error': 'Topilmadi!'}, status=status.HTTP_404_NOT_FOUND)
        cart = item.cart
        item.delete()
        return Response(CartSerializer(cart, context={'request': request}).data)


# ─── Sevimlilar ───────────────────────────────────────────

@extend_schema(tags=['Wishlist'])
class WishlistAPIView(APIView):
    permission_classes = (IsAuthenticated,)

    def get_wishlist(self, user):
        wishlist, _ = Wishlist.objects.get_or_create(user=user)
        return wishlist

    def _product(self, request):
        raw = request.data.get('product_id') or request.query_params.get('product_id')
        try:
            product_id = int(raw)
        except (TypeError, ValueError):
            return None, Response({'error': 'product_id talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)
        product = Product.objects.filter(pk=product_id).first()
        if not product:
            return None, Response({'error': 'Mahsulot topilmadi'}, status=status.HTTP_404_NOT_FOUND)
        return product, None

    def _response(self, request, wishlist):
        return Response(WishlistSerializer(wishlist, context={'request': request}).data)

    @extend_schema(responses=WishlistSerializer, summary="Sevimlilarni ko'rish")
    def get(self, request):
        return self._response(request, self.get_wishlist(request.user))

    @extend_schema(responses=WishlistSerializer, summary="Sevimlilarga qo'shish")
    def post(self, request):
        product, error = self._product(request)
        if error:
            return error
        wishlist = self.get_wishlist(request.user)
        wishlist.products.add(product)
        return self._response(request, wishlist)

    @extend_schema(responses=WishlistSerializer, summary="Sevimlilardan o'chirish (?product_id=)")
    def delete(self, request):
        product, error = self._product(request)
        if error:
            return error
        wishlist = self.get_wishlist(request.user)
        wishlist.products.remove(product)
        return self._response(request, wishlist)


# ─── Buyurtmalar ──────────────────────────────────────────

def user_orders(user):
    return (
        Order.objects.filter(user=user)
        .select_related('product__category')
        .prefetch_related('product__storage_options')
    )


@extend_schema(tags=['Orders'])
class OrderListCreateAPIView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = 'orders'

    @extend_schema(responses=OrderSerializer(many=True), summary="Mening buyurtmalarim")
    def get(self, request):
        orders = list(user_orders(request.user)[:200])
        return Response(OrderSerializer(orders, many=True, context=order_context(request, orders)).data)

    @extend_schema(request=OrderCreateSerializer, responses=OrderSerializer(many=True), summary="Buyurtma yaratish")
    def post(self, request):
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            orders = services.create_orders(request.user, serializer.validated_data)
        except services.ShopError as exc:
            return error_response(exc)
        logger.info("Buyurtma yaratildi: user_id=%s orders=%s", request.user.pk, [o.pk for o in orders])
        notifications.notify_order_created(orders, StoreSettings.load())
        created = list(user_orders(request.user).filter(pk__in=[o.pk for o in orders]))
        return Response(
            OrderSerializer(created, many=True, context=order_context(request, created)).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=['Orders'])
class OrderDetailAPIView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=OrderSerializer, summary="Buyurtma ma'lumoti")
    def get(self, request, pk):
        order = user_orders(request.user).filter(pk=pk).first()
        if not order:
            return Response({'error': 'Topilmadi'}, status=status.HTTP_404_NOT_FOUND)
        return Response(OrderSerializer(order, context=order_context(request, [order])).data)


@extend_schema(tags=['Orders'])
class OrderCancelAPIView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = 'orders'

    @extend_schema(request=None, responses=OrderSerializer, summary="O'z buyurtmasini bekor qilish (faqat pending)")
    def post(self, request, pk):
        try:
            services.cancel_own_order(request.user, pk)
        except services.ShopError as exc:
            return error_response(exc)
        order = user_orders(request.user).get(pk=pk)
        return Response(OrderSerializer(order, context=order_context(request, [order])).data)


# ─── To'lovlar ────────────────────────────────────────────

@extend_schema(tags=['Payments'])
class PaymentListCreateAPIView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = 'payments'

    def get_throttles(self):
        # Limit faqat chek yuklashga tegishli; ro'yxatni o'qish umumiy limitda
        if self.request.method != 'POST':
            self.throttle_scope = None
        return super().get_throttles()

    @extend_schema(responses=PaymentSerializer(many=True), summary="Mening to'lovlarim")
    def get(self, request):
        payments = Payment.objects.filter(user=request.user)[:100]
        return Response(PaymentSerializer(payments, many=True, context={'request': request}).data)

    @extend_schema(request=PaymentCreateSerializer, responses=PaymentSerializer,
                   summary="Kartaga o'tkazma chekini yuborish")
    def post(self, request):
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            payment = services.create_payment(request.user, d['checkout_id'], d['check_photo'], d['card_number'])
        except services.ShopError as exc:
            return error_response(exc)
        logger.info("To'lov cheki yuborildi: user_id=%s payment_id=%s", request.user.pk, payment.pk)
        return Response(
            PaymentSerializer(payment, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=['Payments'])
class PaymentReceiptAPIView(APIView):
    """Chek rasmi: faqat to'lov egasi yoki admin. Fayl ommaviy /media/ da saqlanmaydi."""
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses={200: bytes}, summary="To'lov cheki rasmi")
    def get(self, request, pk):
        queryset = Payment.objects.all() if request.user.is_staff else Payment.objects.filter(user=request.user)
        payment = queryset.filter(pk=pk).first()
        # Begona to'lov ham "topilmadi" — mavjudligini oshkor qilmaslik uchun
        if not payment or not payment.check_photo:
            return Response({'error': 'Topilmadi'}, status=status.HTTP_404_NOT_FOUND)
        try:
            handle = payment.check_photo.open('rb')
        except OSError:
            return Response({'error': 'Topilmadi'}, status=status.HTTP_404_NOT_FOUND)
        content_type = mimetypes.guess_type(payment.check_photo.name)[0] or 'application/octet-stream'
        response = FileResponse(handle, content_type=content_type)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
