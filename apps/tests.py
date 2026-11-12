"""
APEX Store backend testlari.

Ishga tushirish (SQLite bilan, Postgres/Redis shart emas):
    DB_NAME= python manage.py test          (bash)
    $env:DB_NAME=''; python manage.py test  (PowerShell)
"""
import io
import re
import shutil
import tempfile
from decimal import Decimal

from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from apps import otp
from apps.models import (
    AdminAuditLog, Cart, CartItem, Category, ColorVariant, ContactMessage, NewsletterSubscriber, Order,
    Payment, Product, ProductPhoto, StorageOption, StoreSettings, User, apply_discount, format_money,
)

PASSWORD = 'Str0ng-Parol!42'
MEDIA_TMP = tempfile.mkdtemp(prefix='apex-test-media-')
PRIVATE_TMP = tempfile.mkdtemp(prefix='apex-test-private-')


def image_file(name='photo.png', size=(8, 8), fmt='PNG'):
    buf = io.BytesIO()
    Image.new('RGB', size, 'white').save(buf, fmt)
    return SimpleUploadedFile(name, buf.getvalue(), content_type=f'image/{fmt.lower()}')


def last_code() -> str:
    """Oxirgi yuborilgan emaildagi 6 xonali kod."""
    return re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)


@override_settings(MEDIA_ROOT=MEDIA_TMP, PRIVATE_MEDIA_ROOT=PRIVATE_TMP)
class BaseTestCase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_TMP, ignore_errors=True)
        shutil.rmtree(PRIVATE_TMP, ignore_errors=True)

    def setUp(self):
        cache.clear()  # throttle va OTP holati testlar orasida o'tmasin
        mail.outbox.clear()
        self.category = Category.objects.create(title='iPhones', photo='categories/x.png')
        self.product = Product.objects.create(
            title='iPhone 15', price=1000, discount=10, description='d', category=self.category, quantity=5,
        )
        self.user = User.objects.create_user(email='ali@example.com', password=PASSWORD, first_name='Ali')
        self.other = User.objects.create_user(email='vali@example.com', password=PASSWORD)
        self.admin = User.objects.create_superuser(email='admin@example.com', password=PASSWORD, username='boss')

    def login(self, user):
        self.client.force_authenticate(user=user)

    def logout(self):
        self.client.force_authenticate(user=None)

    # Refresh token javob tanasida emas, httpOnly cookie'da keladi
    REFRESH_COOKIE = 'refresh_token'

    def refresh_cookie(self) -> str:
        return self.client.cookies[self.REFRESH_COOKIE].value

    def use_refresh_cookie(self, value: str) -> None:
        """Brauzerda eski (o'g'irlangan) cookie turgan holatni tiklaydi."""
        self.client.cookies[self.REFRESH_COOKIE] = value

    def refresh(self, **extra):
        return self.client.post('/api/auth/refresh/', **extra)

    def order_payload(self, **extra):
        return {'first_name': 'Ali', 'phone_number': '+998901234567', 'address': 'Toshkent, Chilonzor 1', **extra}


# ─── Narx ─────────────────────────────────────────────────

class PricingTests(BaseTestCase):
    def test_apply_discount_rounds_half_up(self):
        self.assertEqual(apply_discount(1000, 10), Decimal('900'))
        self.assertEqual(apply_discount(999, 15), Decimal('849'))   # 849.15
        self.assertEqual(apply_discount(5, 50), Decimal('3'))       # 2.5 -> 3
        self.assertEqual(apply_discount(1000, 0), Decimal('1000'))
        self.assertEqual(apply_discount(1000, 100), Decimal('0'))

    def test_final_price_uses_cheapest_storage_option(self):
        StorageOption.objects.create(product=self.product, label='256', storage='256GB', price=1200)
        StorageOption.objects.create(product=self.product, label='128', storage='128GB', price=1100)
        res = self.client.get(f'/api/products/{self.product.pk}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['price'], '1000')
        self.assertEqual(res.data['final_price'], '990')  # 1100 - 10%
        self.assertEqual(
            sorted(o['final_price'] for o in res.data['storage_options']), ['1080', '990'],
        )


# ─── Katalog ──────────────────────────────────────────────

class CatalogTests(BaseTestCase):
    def titles(self, query=''):
        res = self.client.get(f'/api/products/{query}')
        self.assertEqual(res.status_code, 200, res.data)
        return [p['title'] for p in res.data['results']]

    def make(self, title, price, **extra):
        defaults = {'description': 'd', 'category': self.category, 'quantity': 1}
        return Product.objects.create(title=title, price=price, **{**defaults, **extra})

    def test_inactive_products_are_hidden_everywhere(self):
        hidden = self.make('Yashirin iPhone', 1, is_active=False)
        StorageOption.objects.create(product=hidden, label='x', storage='9TB', price=1)
        self.assertEqual(self.titles(), ['iPhone 15'])
        self.assertEqual(self.client.get(f'/api/products/{hidden.pk}/').status_code, 404)
        self.assertEqual(len(self.client.get('/api/products/search/?title=iphone').data), 1)
        category = self.client.get(f'/api/categories/{self.category.pk}/').data
        self.assertEqual(category['product_count'], 1)
        self.assertNotIn('products', category)  # cheklanmagan ichki ro'yxat endi yo'q
        self.assertEqual(self.client.get('/api/categories/').data[0]['product_count'], 1)
        facets = self.client.get('/api/products/facets/').data
        self.assertEqual(facets['count'], 1)
        self.assertNotIn('9TB', facets['storages'])

    def test_empty_search_returns_nothing(self):
        self.assertEqual(self.client.get('/api/products/search/').data, [])

    def test_list_is_paginated_and_page_size_is_capped(self):
        for i in range(30):
            self.make(f'P{i:02d}', 10 + i)
        first = self.client.get('/api/products/').data
        self.assertEqual((first['count'], first['page'], first['pages'], first['page_size']), (31, 1, 2, 24))
        self.assertEqual(len(first['results']), 24)
        second = self.client.get('/api/products/?page=2').data
        self.assertEqual(len(second['results']), 7)
        self.assertFalse({p['id'] for p in first['results']} & {p['id'] for p in second['results']})
        # chegaradan tashqari sahifa — oxirgi sahifa; juda katta page_size rad etiladi
        self.assertEqual(self.client.get('/api/products/?page=999').data['page'], 2)
        self.assertEqual(self.client.get('/api/products/?page_size=61').status_code, 400)
        self.assertEqual(len(self.client.get('/api/products/?page_size=60').data['results']), 31)

    def test_product_list_query_count_is_constant(self):
        for i in range(10):
            p = self.make(f'P{i}', 10)
            StorageOption.objects.create(product=p, label='x', storage='1GB', price=20)
        with self.assertNumQueries(3):  # count + sahifa (kategoriya JOIN bilan) + storage_options prefetch
            self.client.get('/api/products/')

    def test_price_sorting_and_ranges_use_the_displayed_price(self):
        self.product.delete()
        self.make('Arzon', 300)
        self.make('Chegirmali', 1000, discount=50)                # ko'rinadigan narx 500
        variant = self.make('Variantli', 5000)                    # eng arzon varianti 800
        StorageOption.objects.create(product=variant, label='a', storage='128GB', price=800)
        StorageOption.objects.create(product=variant, label='b', storage='256GB', price=900)
        self.make('Qimmat', 2500)
        self.assertEqual(self.titles('?ordering=price_asc'), ['Arzon', 'Chegirmali', 'Variantli', 'Qimmat'])
        self.assertEqual(self.titles('?ordering=price_desc'), ['Qimmat', 'Variantli', 'Chegirmali', 'Arzon'])
        self.assertEqual(self.titles('?ordering=price_asc&price=400-900'), ['Chegirmali', 'Variantli'])
        self.assertEqual(self.titles('?ordering=price_asc&price=-300,2000-'), ['Arzon', 'Qimmat'])
        # API qaytargan narx ham aynan shu qiymat
        shown = {p['title']: int(p['final_price']) for p in self.client.get('/api/products/').data['results']}
        self.assertEqual(shown, {'Arzon': 300, 'Chegirmali': 500, 'Variantli': 800, 'Qimmat': 2500})
        facets = self.client.get('/api/products/facets/').data
        self.assertEqual((facets['min_price'], facets['max_price']), (300, 2500))

    def test_filters(self):
        other = Category.objects.create(title='MacBooks', photo='categories/m.png')
        mac = self.make('MacBook Air', 1200, category=other, quantity=0, discount=10)
        for storage in ('256GB', '512GB'):
            StorageOption.objects.create(product=mac, label=storage, storage=storage, price=1200)
        for name in ('Silver', 'Midnight'):
            ColorVariant.objects.create(product=mac, name=name, hex_code='#111111')
        StorageOption.objects.create(product=self.product, label='128', storage='128GB', price=1000)
        ColorVariant.objects.create(product=self.product, name='Midnight', hex_code='#000000')

        self.assertEqual(self.titles(f'?category={other.pk}'), ['MacBook Air'])
        self.assertEqual(self.titles('?q=macbook'), ['MacBook Air'])
        self.assertEqual(self.titles('?in_stock=true'), ['iPhone 15'])
        self.assertEqual(self.titles(f'?exclude={mac.pk}'), ['iPhone 15'])
        # ikkala varianti ham mos keladi, lekin mahsulot bir marta chiqadi
        both = self.client.get('/api/products/?storage=256GB&storage=512GB&color=Silver&color=Midnight').data
        self.assertEqual((both['count'], [p['title'] for p in both['results']]), (1, ['MacBook Air']))
        self.assertEqual(sorted(self.titles('?color=Midnight')), ['MacBook Air', 'iPhone 15'])
        self.assertEqual(self.titles('?storage=128GB&color=Silver'), [])

        facets = self.client.get(f'/api/products/facets/?category={other.pk}').data
        self.assertEqual(facets['storages'], ['256GB', '512GB'])
        self.assertEqual([c['name'] for c in facets['colors']], ['Midnight', 'Silver'])
        self.assertEqual(facets['count'], 1)

    def test_bad_query_parameters_are_rejected(self):
        for query in ('?ordering=password', '?price=abc', '?price=10', '?price=-5--1', '?page=0', '?category=x',
                      '?price=' + ','.join(['1-2'] * 7), '?q=' + 'a' * 101, '?price=NaN-5'):
            self.assertEqual(self.client.get(f'/api/products/{query}').status_code, 400, query)
        # SQL belgilari oddiy matn sifatida qidiriladi
        self.assertEqual(self.titles("?q=' OR 1=1 --"), [])
        self.assertEqual(self.titles('?q=%25'), [])

    def test_public_endpoints_need_no_auth_private_ones_do(self):
        for url in ('/api/products/', '/api/categories/', '/api/health/'):
            self.assertEqual(self.client.get(url).status_code, 200, url)
        for url in ('/api/profile/', '/api/cart/', '/api/wishlist/', '/api/orders/'):
            self.assertEqual(self.client.get(url).status_code, 401, url)


# ─── Ro'yxatdan o'tish va OTP ─────────────────────────────

class RegistrationTests(BaseTestCase):
    payload = {
        'first_name': 'Yangi', 'last_name': 'User', 'username': 'yangi',
        'email': 'New@Example.com', 'phone_number': '+998 90 111 22 33', 'password': PASSWORD,
    }

    def verify_email(self, email='new@example.com'):
        self.assertEqual(self.client.post('/api/auth/verify-email/', {'email': email}).status_code, 200)
        res = self.client.post('/api/auth/verify-otp/', {'email': email, 'code': last_code()})
        self.assertEqual(res.status_code, 200, res.data)

    def test_full_registration_flow(self):
        self.verify_email()
        res = self.client.post('/api/auth/register/', self.payload)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertNotIn('password', res.data)  # parol xeshi javobda qaytmasligi kerak
        user = User.objects.get(email='new@example.com')  # email kichik harfga keltirilgan
        self.assertTrue(user.check_password(PASSWORD))
        self.assertEqual(user.phone_number, '+998901112233')
        self.assertFalse(user.is_staff)
        # grant bir martalik
        again = self.client.post('/api/auth/register/', {**self.payload, 'email': 'new@example.com'})
        self.assertEqual(again.status_code, 400)

    def test_register_requires_verified_email(self):
        res = self.client.post('/api/auth/register/', self.payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn('email', res.data)

    def test_register_cannot_set_privileged_fields(self):
        self.verify_email()
        res = self.client.post('/api/auth/register/', {**self.payload, 'is_staff': True, 'is_superuser': True})
        self.assertEqual(res.status_code, 201)
        user = User.objects.get(email='new@example.com')
        self.assertFalse(user.is_staff or user.is_superuser)

    def test_register_rejects_weak_password(self):
        self.verify_email()
        for weak in ('12345678', 'password', 'short'):
            res = self.client.post('/api/auth/register/', {**self.payload, 'password': weak})
            self.assertEqual(res.status_code, 400, weak)

    def test_existing_email_cannot_request_registration_code(self):
        res = self.client.post('/api/auth/verify-email/', {'email': 'ALI@example.com'})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_invalid_email_rejected(self):
        res = self.client.post('/api/auth/verify-email/', {'email': 'not-an-email'})
        self.assertEqual(res.status_code, 400)

    def test_otp_resend_cooldown(self):
        self.assertEqual(self.client.post('/api/auth/verify-email/', {'email': 'a@b.co'}).status_code, 200)
        self.assertEqual(self.client.post('/api/auth/verify-email/', {'email': 'a@b.co'}).status_code, 429)
        self.assertEqual(len(mail.outbox), 1)

    def test_otp_brute_force_is_blocked(self):
        self.client.post('/api/auth/verify-email/', {'email': 'a@b.co'})
        real = last_code()
        wrong = '000000' if real != '000000' else '111111'
        for _ in range(otp.MAX_VERIFY_ATTEMPTS):
            res = self.client.post('/api/auth/verify-otp/', {'email': 'a@b.co', 'code': wrong})
            self.assertEqual(res.status_code, 400)
        # limitdan keyin hatto to'g'ri kod ham ishlamaydi
        res = self.client.post('/api/auth/verify-otp/', {'email': 'a@b.co', 'code': real})
        self.assertEqual(res.status_code, 429)
        res = self.client.post('/api/auth/verify-otp/', {'email': 'a@b.co', 'code': real})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(otp.has_grant('register', 'a@b.co'))

    def test_otp_is_single_use(self):
        self.client.post('/api/auth/verify-email/', {'email': 'a@b.co'})
        code = last_code()
        self.assertEqual(self.client.post('/api/auth/verify-otp/', {'email': 'a@b.co', 'code': code}).status_code, 200)
        self.assertEqual(self.client.post('/api/auth/verify-otp/', {'email': 'a@b.co', 'code': code}).status_code, 400)

    def test_code_for_one_email_does_not_verify_another(self):
        self.client.post('/api/auth/verify-email/', {'email': 'a@b.co'})
        code = last_code()
        res = self.client.post('/api/auth/verify-otp/', {'email': 'x@b.co', 'code': code})
        self.assertEqual(res.status_code, 400)


# ─── Login ────────────────────────────────────────────────

class LoginTests(BaseTestCase):
    def test_login_success_case_insensitive_email(self):
        res = self.client.post('/api/token/', {'email': 'ALI@Example.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIn('access', res.data)
        # refresh token JavaScript'ga ko'rinmasligi kerak: tanada yo'q, cookie esa httpOnly
        self.assertNotIn('refresh', res.data)
        cookie = res.cookies[self.REFRESH_COOKIE]
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Lax')
        self.assertEqual(cookie['path'], '/api/auth/')
        self.assertGreater(int(cookie['max-age']), 6 * 24 * 3600)

    @override_settings(AUTH_COOKIE_SECURE=True)
    def test_refresh_cookie_is_secure_in_production(self):
        res = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        self.assertTrue(res.cookies[self.REFRESH_COOKIE]['secure'])

    def test_failed_login_sets_no_cookie(self):
        res = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': 'xato-parol'})
        self.assertNotIn(self.REFRESH_COOKIE, res.cookies)

    def test_login_wrong_password(self):
        res = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': 'xato-parol'})
        self.assertEqual(res.status_code, 400)
        self.assertNotIn('access', res.data)

    def test_inactive_user_cannot_login(self):
        self.user.is_active = False
        self.user.save()
        res = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 400)

    def test_account_locks_after_repeated_failures(self):
        for _ in range(10):
            res = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': 'xato'})
            self.assertEqual(res.status_code, 400)  # IP throttle emas, oddiy rad etish
            self._reset_ip_throttle()
        res = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 429)
        self.assertIn("noto'g'ri urinish", str(res.data['detail']))  # aynan hisob bloki
        # boshqa hisob bloklanmagan
        self._reset_ip_throttle()
        other = self.client.post('/api/token/', {'email': 'vali@example.com', 'password': PASSWORD})
        self.assertEqual(other.status_code, 200)

    def _reset_ip_throttle(self):
        # IP throttle (10/min) emas, aynan hisob bo'yicha blokni tekshirish uchun
        cache.delete('throttle_login_127.0.0.1')

    def test_login_ip_throttle(self):
        statuses = [
            self.client.post('/api/token/', {'email': f'u{i}@example.com', 'password': 'x'}).status_code
            for i in range(12)
        ]
        self.assertIn(429, statuses)

    def test_staff_must_use_admin_login(self):
        res = self.client.post('/api/token/', {'email': 'admin@example.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 403)
        self.assertNotIn('access', res.data)

    def test_refresh_rotates_and_blacklists_old_token(self):
        self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        old = self.refresh_cookie()
        first = self.refresh()
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(set(first.data), {'access'})
        self.assertNotEqual(self.refresh_cookie(), old)  # yangi token cookie'ga yozildi
        # yangi access token haqiqatan ishlaydi
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {first.data['access']}")
        self.assertEqual(self.client.get('/api/profile/').status_code, 200)
        self.client.credentials()
        # eski (aylantirilgan) token qayta ishlatilsa rad etiladi
        self.use_refresh_cookie(old)
        self.assertEqual(self.refresh().status_code, 401)

    def test_refresh_needs_the_cookie(self):
        tokens_in_body = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        token = self.refresh_cookie()
        self.client.cookies.clear()
        self.assertEqual(self.refresh().status_code, 401)
        # tanada yuborilgan token qabul qilinmaydi — faqat cookie
        res = self.client.post('/api/auth/refresh/', {'refresh': token})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(tokens_in_body.status_code, 200)

    def test_refresh_rejects_requests_from_other_sites(self):
        self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        evil = self.refresh(HTTP_ORIGIN='https://evil.example')
        self.assertEqual(evil.status_code, 403)
        self.assertNotIn(self.REFRESH_COOKIE, evil.cookies)  # token aylantirilmadi
        self.assertEqual(self.refresh(HTTP_ORIGIN='null').status_code, 403)
        self.assertEqual(self.refresh(HTTP_REFERER='https://evil.example/page').status_code, 403)
        self.assertEqual(self.client.post('/api/auth/logout/', HTTP_ORIGIN='https://evil.example').status_code, 403)
        # ruxsat etilgan frontend va brauzer bo'lmagan mijoz (Origin yo'q) ishlaydi
        self.assertEqual(self.refresh(HTTP_ORIGIN='http://localhost:3000').status_code, 200)
        self.assertEqual(self.refresh().status_code, 200)

    def test_login_csrf_is_blocked(self):
        # Begona saytdagi yashirin forma qurbonni hujumchining hisobiga kiritib qo'ymasligi kerak:
        # javobdagi Set-Cookie brauzerga yozilgan bo'lardi
        creds = {'email': 'ali@example.com', 'password': PASSWORD}
        evil = self.client.post('/api/token/', creds, HTTP_ORIGIN='https://evil.example')
        self.assertEqual(evil.status_code, 403)
        self.assertNotIn(self.REFRESH_COOKIE, evil.cookies)
        form_post = self.client.post(
            '/api/token/', 'email=ali%40example.com&password=' + PASSWORD,
            content_type='application/x-www-form-urlencoded', HTTP_ORIGIN='https://evil.example',
        )
        self.assertEqual(form_post.status_code, 403)
        self.assertEqual(self.client.post('/api/admin/auth/verify/', {'challenge': 'x', 'code': '1'},
                                          HTTP_ORIGIN='https://evil.example').status_code, 403)
        self.assertEqual(self.client.post('/api/auth/firebase-login/', {'firebase_token': 'x'},
                                          HTTP_ORIGIN='https://evil.example').status_code, 403)
        ok = self.client.post('/api/token/', creds, HTTP_ORIGIN='http://localhost:3000')
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.headers['Cache-Control'], 'no-store')
        self.assertEqual(self.refresh().headers['Cache-Control'], 'no-store')

    @override_settings(CORS_ALLOWED_ORIGIN_REGEXES=[settings.LOCAL_DEV_ORIGIN_REGEX])
    def test_local_dev_origin_pattern_is_anchored(self):
        self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        self.assertEqual(self.refresh(HTTP_ORIGIN='http://localhost:3002').status_code, 200)
        for origin in ('http://localhost.evil.example', 'http://localhost:3000.evil.example',
                       'https://localhost:3002', 'http://evil.example/http://localhost:3000'):
            self.assertEqual(self.refresh(HTTP_ORIGIN=origin).status_code, 403, origin)
            preflight = self.client.options(
                '/api/auth/refresh/', HTTP_ORIGIN=origin, HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            )
            self.assertIsNone(preflight.headers.get('Access-Control-Allow-Origin'), origin)

    def test_cors_allows_credentials_only_for_listed_origins(self):
        ok = self.client.options(
            '/api/auth/refresh/', HTTP_ORIGIN='http://localhost:3000', HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
        )
        self.assertEqual(ok.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
        self.assertEqual(ok.headers.get('Access-Control-Allow-Credentials'), 'true')
        evil = self.client.options(
            '/api/auth/refresh/', HTTP_ORIGIN='https://evil.example', HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
        )
        self.assertIsNone(evil.headers.get('Access-Control-Allow-Origin'))


# ─── Parolni tiklash ──────────────────────────────────────

class PasswordResetTests(BaseTestCase):
    NEW = 'Yangi-Parol!77'

    def test_full_reset_flow_and_old_sessions_revoked(self):
        self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        old_refresh = self.refresh_cookie()

        self.assertEqual(self.client.post('/api/auth/forgot-password/', {'email': 'ali@example.com'}).status_code, 200)
        res = self.client.post('/api/auth/forgot-password-verify/', {'email': 'ali@example.com', 'code': last_code()})
        self.assertEqual(res.status_code, 200, res.data)
        res = self.client.post('/api/auth/reset-password/', {
            'email': 'ali@example.com', 'new_password': self.NEW, 'confirm_password': self.NEW,
        })
        self.assertEqual(res.status_code, 200, res.data)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.NEW))
        # eski refresh token endi ishlamaydi
        self.use_refresh_cookie(old_refresh)
        self.assertEqual(self.refresh().status_code, 401)
        # grant bir martalik
        res = self.client.post('/api/auth/reset-password/', {
            'email': 'ali@example.com', 'new_password': 'Boshqa-Parol!1', 'confirm_password': 'Boshqa-Parol!1',
        })
        self.assertEqual(res.status_code, 400)

    def test_reset_without_verified_code_is_rejected(self):
        res = self.client.post('/api/auth/reset-password/', {
            'email': 'ali@example.com', 'new_password': self.NEW, 'confirm_password': self.NEW,
        })
        self.assertEqual(res.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))

    def test_forgot_password_does_not_reveal_whether_email_exists(self):
        known = self.client.post('/api/auth/forgot-password/', {'email': 'ali@example.com'})
        unknown = self.client.post('/api/auth/forgot-password/', {'email': 'nobody@example.com'})
        self.assertEqual((known.status_code, known.data), (unknown.status_code, unknown.data))
        self.assertEqual(len(mail.outbox), 1)

    def test_reset_code_brute_force_is_blocked(self):
        self.client.post('/api/auth/forgot-password/', {'email': 'ali@example.com'})
        real = last_code()
        wrong = '000000' if real != '000000' else '111111'
        for _ in range(otp.MAX_VERIFY_ATTEMPTS):
            self.client.post('/api/auth/forgot-password-verify/', {'email': 'ali@example.com', 'code': wrong})
        res = self.client.post('/api/auth/forgot-password-verify/', {'email': 'ali@example.com', 'code': real})
        self.assertEqual(res.status_code, 429)

    def test_register_code_cannot_be_used_for_reset(self):
        """Bir maqsad uchun berilgan kod boshqasida ishlamasligi kerak."""
        code = otp.issue('register', 'ali@example.com')
        res = self.client.post('/api/auth/forgot-password-verify/', {'email': 'ali@example.com', 'code': code})
        self.assertEqual(res.status_code, 400)

    def test_reset_rejects_weak_password(self):
        otp.grant('reset', 'ali@example.com')
        res = self.client.post('/api/auth/reset-password/', {
            'email': 'ali@example.com', 'new_password': '12345678', 'confirm_password': '12345678',
        })
        self.assertEqual(res.status_code, 400)


# ─── Profil ───────────────────────────────────────────────

class ProfileTests(BaseTestCase):
    def test_profile_read_and_safe_update(self):
        self.login(self.user)
        res = self.client.get('/api/profile/')
        self.assertEqual(res.data['email'], 'ali@example.com')
        self.assertFalse(res.data['is_staff'])
        self.assertNotIn('password', res.data)

        res = self.client.patch('/api/profile/', {
            'first_name': 'Alisher', 'email': 'hacker@example.com', 'is_staff': True, 'phone_number': '+1',
        })
        self.assertEqual(res.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Alisher')
        self.assertEqual(self.user.email, 'ali@example.com')  # email o'zgarmaydi
        self.assertFalse(self.user.is_staff)                   # huquq oshirib bo'lmaydi
        self.assertIsNone(self.user.phone_number)

    def test_change_password(self):
        self.login(self.user)
        bad = self.client.post('/api/profile/change-password/', {
            'old_password': 'xato', 'new_password': 'Yangi-Parol!77', 'confirm_password': 'Yangi-Parol!77',
        })
        self.assertEqual(bad.status_code, 400)
        weak = self.client.post('/api/profile/change-password/', {
            'old_password': PASSWORD, 'new_password': '12345678', 'confirm_password': '12345678',
        })
        self.assertEqual(weak.status_code, 400)
        ok = self.client.post('/api/profile/change-password/', {
            'old_password': PASSWORD, 'new_password': 'Yangi-Parol!77', 'confirm_password': 'Yangi-Parol!77',
        })
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertIn('access', ok.data)
        self.assertNotIn('refresh', ok.data)
        self.assertTrue(ok.cookies[self.REFRESH_COOKIE]['httponly'])  # joriy qurilma yangi sessiya oladi
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Yangi-Parol!77'))

    def test_change_password_revokes_other_sessions(self):
        self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        other_device = self.refresh_cookie()
        self.login(self.user)
        ok = self.client.post('/api/profile/change-password/', {
            'old_password': PASSWORD, 'new_password': 'Yangi-Parol!77', 'confirm_password': 'Yangi-Parol!77',
        })
        self.assertEqual(ok.status_code, 200, ok.data)
        this_device = self.refresh_cookie()
        self.logout()  # test mijozi bunda cookie'larni ham tozalaydi
        self.use_refresh_cookie(this_device)
        self.assertEqual(self.refresh().status_code, 200)  # shu qurilma ishlashda davom etadi
        self.use_refresh_cookie(other_device)
        self.assertEqual(self.refresh().status_code, 401)


# ─── Savat ────────────────────────────────────────────────

class CartTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.s256 = StorageOption.objects.create(product=self.product, label='256', storage='256GB', price=1200)
        self.s128 = StorageOption.objects.create(product=self.product, label='128', storage='128GB', price=1100)
        self.blue = ColorVariant.objects.create(product=self.product, name='Blue', hex_code='#0000ff')
        self.login(self.user)

    def test_add_with_variant_uses_server_price(self):
        res = self.client.post('/api/cart/', {
            'product_id': self.product.pk, 'quantity': 2,
            'storage_option_id': self.s256.pk, 'color_variant_id': self.blue.pk,
            'price': 1, 'unit_price': 1,  # mijoz yuborgan narx e'tiborga olinmaydi
        })
        self.assertEqual(res.status_code, 200, res.data)
        item = res.data['items'][0]
        self.assertEqual(item['unit_price'], '1080')   # 1200 - 10%
        self.assertEqual(item['total'], '2160')
        self.assertEqual(res.data['total_price'], '2160')
        self.assertEqual(item['storage_option']['id'], self.s256.pk)
        self.assertEqual(item['color_variant']['name'], 'Blue')

    def test_default_variant_is_cheapest(self):
        res = self.client.post('/api/cart/', {'product_id': self.product.pk})
        self.assertEqual(res.data['items'][0]['storage_option']['id'], self.s128.pk)
        self.assertEqual(res.data['items'][0]['unit_price'], '990')

    def test_same_variant_merges_different_variant_is_new_line(self):
        self.client.post('/api/cart/', {'product_id': self.product.pk, 'storage_option_id': self.s128.pk})
        self.client.post('/api/cart/', {'product_id': self.product.pk, 'storage_option_id': self.s128.pk})
        res = self.client.post('/api/cart/', {'product_id': self.product.pk, 'storage_option_id': self.s256.pk})
        self.assertEqual(res.data['items_count'], 2)
        self.assertEqual(sorted(i['quantity'] for i in res.data['items']), [1, 2])

    def test_cannot_exceed_stock_across_lines(self):
        self.client.post('/api/cart/', {'product_id': self.product.pk, 'storage_option_id': self.s128.pk, 'quantity': 3})
        res = self.client.post('/api/cart/', {
            'product_id': self.product.pk, 'storage_option_id': self.s256.pk, 'quantity': 3,
        })
        self.assertEqual(res.status_code, 400)  # 3 + 3 > 5
        item_id = CartItem.objects.get().pk
        self.assertEqual(self.client.patch(f'/api/cart/{item_id}/', {'quantity': 6}).status_code, 400)
        self.assertEqual(self.client.patch(f'/api/cart/{item_id}/', {'quantity': 5}).status_code, 200)

    def test_invalid_quantities_rejected(self):
        for qty in (0, -1, 101, 'abc'):
            res = self.client.post('/api/cart/', {'product_id': self.product.pk, 'quantity': qty})
            self.assertEqual(res.status_code, 400, qty)

    def test_variant_of_another_product_rejected(self):
        other = Product.objects.create(title='Mac', price=1, description='d', category=self.category, quantity=1)
        foreign = StorageOption.objects.create(product=other, label='x', storage='1TB', price=1)
        res = self.client.post('/api/cart/', {'product_id': self.product.pk, 'storage_option_id': foreign.pk})
        self.assertEqual(res.status_code, 400)

    def test_inactive_product_cannot_be_added(self):
        self.product.is_active = False
        self.product.save()
        self.assertEqual(self.client.post('/api/cart/', {'product_id': self.product.pk}).status_code, 404)

    def test_cannot_touch_another_users_cart_item(self):
        self.client.post('/api/cart/', {'product_id': self.product.pk})
        item_id = CartItem.objects.get().pk
        self.login(self.other)
        self.assertEqual(self.client.patch(f'/api/cart/{item_id}/', {'quantity': 2}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/cart/{item_id}/').status_code, 404)
        self.assertEqual(self.client.get('/api/cart/').data['items'], [])
        self.assertTrue(CartItem.objects.filter(pk=item_id).exists())

    def test_remove_and_clear(self):
        self.client.post('/api/cart/', {'product_id': self.product.pk})
        item_id = CartItem.objects.get().pk
        self.assertEqual(self.client.delete(f'/api/cart/{item_id}/').data['items'], [])
        self.client.post('/api/cart/', {'product_id': self.product.pk})
        self.assertEqual(self.client.delete('/api/cart/').status_code, 200)
        self.assertEqual(CartItem.objects.count(), 0)


# ─── Sevimlilar ───────────────────────────────────────────

class WishlistTests(BaseTestCase):
    def test_add_list_remove(self):
        self.login(self.user)
        res = self.client.post('/api/wishlist/', {'product_id': self.product.pk})
        self.assertEqual([p['id'] for p in res.data['products']], [self.product.pk])
        res = self.client.delete(f'/api/wishlist/?product_id={self.product.pk}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['products'], [])

    def test_bad_product_id(self):
        self.login(self.user)
        self.assertEqual(self.client.post('/api/wishlist/', {}).status_code, 400)
        self.assertEqual(self.client.post('/api/wishlist/', {'product_id': 'abc'}).status_code, 400)
        self.assertEqual(self.client.post('/api/wishlist/', {'product_id': 999999}).status_code, 404)

    def test_wishlists_are_private(self):
        self.login(self.user)
        self.client.post('/api/wishlist/', {'product_id': self.product.pk})
        self.login(self.other)
        self.assertEqual(self.client.get('/api/wishlist/').data['products'], [])


# ─── Buyurtmalar ──────────────────────────────────────────

class OrderTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.login(self.user)

    def test_direct_order_snapshots_price_and_decrements_stock(self):
        res = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk, quantity=2))
        self.assertEqual(res.status_code, 201, res.data)
        order = res.data[0]
        self.assertEqual((order['unit_price'], order['total_price']), ('900', '1800'))
        self.assertTrue(order['has_discount'])
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 3)

        # mahsulot narxi keyin o'zgarsa ham buyurtma narxi o'zgarmaydi
        self.product.price = 5000
        self.product.save()
        self.assertEqual(self.client.get(f"/api/orders/{order['id']}/").data['total_price'], '1800')

    def test_client_cannot_dictate_price(self):
        res = self.client.post('/api/orders/', self.order_payload(
            product_id=self.product.pk, unit_price=1, total_price=1, price=1, status='delivered', user=self.other.pk,
        ))
        self.assertEqual(res.status_code, 201)
        order = Order.objects.get()
        self.assertEqual(order.total_price, Decimal('900'))
        self.assertEqual(order.status, Order.Status.PENDING)
        self.assertEqual(order.user, self.user)

    def test_order_from_cart_with_variants(self):
        big = StorageOption.objects.create(product=self.product, label='256', storage='256GB', ram='8GB', price=1200)
        blue = ColorVariant.objects.create(product=self.product, name='Blue', hex_code='#00f')
        mac = Product.objects.create(title='Mac', price=2000, description='d', category=self.category, quantity=1)
        self.client.post('/api/cart/', {
            'product_id': self.product.pk, 'quantity': 2, 'storage_option_id': big.pk, 'color_variant_id': blue.pk,
        })
        self.client.post('/api/cart/', {'product_id': mac.pk})

        res = self.client.post('/api/orders/', self.order_payload(from_cart=True, delivery_method='express'))
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(res.data), 2)
        self.assertEqual(len({o['checkout_id'] for o in res.data}), 1)  # bitta checkout
        by_title = {o['product']['title']: o for o in res.data}
        self.assertEqual(by_title['iPhone 15']['total_price'], '2160')
        self.assertEqual(by_title['iPhone 15']['storage_label'], '256GB / 8GB')
        self.assertEqual(by_title['iPhone 15']['color_name'], 'Blue')
        self.assertEqual(by_title['Mac']['total_price'], '2000')
        self.assertEqual(CartItem.objects.count(), 0)  # savat tozalandi
        mac.refresh_from_db()
        self.assertEqual(mac.quantity, 0)

    def test_cart_order_is_all_or_nothing(self):
        """Bitta mahsulot yetmasa — hech narsa yaratilmaydi va zaxira o'zgarmaydi."""
        mac = Product.objects.create(title='Mac', price=2000, description='d', category=self.category, quantity=5)
        self.client.post('/api/cart/', {'product_id': self.product.pk, 'quantity': 2})
        self.client.post('/api/cart/', {'product_id': mac.pk, 'quantity': 2})
        Product.objects.filter(pk=mac.pk).update(quantity=1)  # orada boshqa xaridor sotib oldi

        res = self.client.post('/api/orders/', self.order_payload(from_cart=True))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(Order.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 5)
        self.assertEqual(CartItem.objects.count(), 2)  # savat saqlanib qoldi

    def test_cannot_oversell(self):
        res = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk, quantity=6))
        self.assertEqual(res.status_code, 409)
        ok = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk, quantity=5))
        self.assertEqual(ok.status_code, 201)
        again = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk, quantity=1))
        self.assertEqual(again.status_code, 409)
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 0)

    def test_validation(self):
        cases = [
            self.order_payload(),                                             # mahsulot ham, savat ham yo'q
            self.order_payload(from_cart=True),                               # bo'sh savat
            self.order_payload(product_id=self.product.pk, quantity=0),
            self.order_payload(product_id=self.product.pk, quantity=-3),
            self.order_payload(product_id=self.product.pk, phone_number='abc'),
            self.order_payload(product_id=self.product.pk, address=''),      # yetkazish uchun manzil shart
            self.order_payload(product_id=self.product.pk, delivery_method='teleport'),
            {'product_id': self.product.pk},                                  # ism/telefon yo'q
        ]
        for payload in cases:
            res = self.client.post('/api/orders/', payload)
            self.assertEqual(res.status_code, 400, payload)
        self.assertEqual(self.client.post('/api/orders/', self.order_payload(product_id=999999)).status_code, 404)
        self.assertEqual(Order.objects.count(), 0)

    def test_pickup_needs_no_address(self):
        res = self.client.post('/api/orders/', self.order_payload(
            product_id=self.product.pk, address='', delivery_method='pickup',
        ))
        self.assertEqual(res.status_code, 201, res.data)

    def test_inactive_product_cannot_be_ordered(self):
        self.product.is_active = False
        self.product.save()
        res = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk))
        self.assertEqual(res.status_code, 409)

    def test_orders_are_private(self):
        order_id = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk)).data[0]['id']
        self.login(self.other)
        self.assertEqual(self.client.get('/api/orders/').data, [])
        self.assertEqual(self.client.get(f'/api/orders/{order_id}/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/orders/{order_id}/cancel/').status_code, 404)

    def test_customer_can_cancel_pending_order_and_stock_returns(self):
        order_id = self.client.post(
            '/api/orders/', self.order_payload(product_id=self.product.pk, quantity=2),
        ).data[0]['id']
        res = self.client.post(f'/api/orders/{order_id}/cancel/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'canceled')
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 5)
        # ikkinchi marta bekor qilib zaxirani "ko'paytirib" bo'lmaydi
        self.assertEqual(self.client.post(f'/api/orders/{order_id}/cancel/').status_code, 409)
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 5)

    def test_deleting_product_with_orders_is_refused(self):
        self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk))
        self.login(self.admin)
        res = self.client.delete(f'/api/admin/products/{self.product.pk}/')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(Order.objects.count(), 1)


# ─── To'lov ───────────────────────────────────────────────

class PaymentTests(BaseTestCase):
    """Kartaga o'tkazma: chek faqat o'z buyurtmasiga, summa serverda hisoblanadi."""

    def setUp(self):
        super().setUp()
        StoreSettings.objects.update_or_create(pk=1, defaults={
            'payment_card_number': '8600 1111 2222 3333', 'payment_card_holder': 'APEX STORE',
        })
        cache.clear()
        self.login(self.user)
        self.order = self.client.post(
            '/api/orders/', self.order_payload(product_id=self.product.pk, quantity=2),
        ).data[0]
        self.checkout_id = self.order['checkout_id']

    def pay(self, **override):
        data = {'checkout_id': self.checkout_id, 'check_photo': image_file('chek.png'), **override}
        return self.client.post('/api/payments/', data, format='multipart')

    def test_amount_is_computed_on_server_and_card_masked(self):
        res = self.pay(card_number='8600 1234 5678 9012', amount=1, status='complete', user=self.other.pk)
        self.assertEqual(res.status_code, 201, res.data)
        payment = Payment.objects.get()
        self.assertEqual(payment.amount, Decimal('1800'))        # 2 × 900, mijoz yuborgan 1 emas
        self.assertEqual(payment.card_number, '************9012')
        self.assertEqual(payment.user, self.user)                 # egasini almashtirib bo'lmaydi
        self.assertEqual(payment.status, Payment.PayStatus.REVIEW)
        self.assertNotIn('chek', payment.check_photo.name)        # tasodifiy fayl nomi
        orders = self.client.get('/api/orders/').data
        self.assertEqual(orders[0]['payment_status'], 'review')

    def test_cannot_pay_for_someone_elses_order(self):
        self.login(self.other)
        self.assertEqual(self.pay().status_code, 404)
        self.assertEqual(Payment.objects.count(), 0)

    def test_duplicate_payment_rejected_until_previous_is_rejected(self):
        self.assertEqual(self.pay().status_code, 201)
        self.assertEqual(self.pay().status_code, 409)
        Payment.objects.update(status=Payment.PayStatus.CANCELED)
        self.assertEqual(self.pay().status_code, 201)

    def test_disabled_when_store_has_no_card(self):
        StoreSettings.objects.filter(pk=1).update(payment_card_number='')
        self.assertEqual(self.pay().status_code, 400)

    def test_canceled_order_cannot_be_paid(self):
        self.client.post(f"/api/orders/{self.order['id']}/cancel/")
        self.assertEqual(self.pay().status_code, 404)

    def test_receipt_is_private(self):
        payment_id = self.pay().data['id']
        url = f'/api/payments/{payment_id}/receipt/'
        payment = Payment.objects.get()
        self.assertTrue(payment.check_photo.path.startswith(PRIVATE_TMP))   # ommaviy MEDIA_ROOT'da emas
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'image/png')
        b''.join(res.streaming_content)
        self.login(self.other)
        self.assertEqual(self.client.get(url).status_code, 404)              # begona — "topilmadi"
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(url).status_code, 401)
        self.login(self.admin)
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        b''.join(res.streaming_content)

    def test_validation(self):
        self.assertEqual(self.pay(checkout_id='not-a-uuid').status_code, 400)
        self.assertEqual(self.pay(card_number='1234').status_code, 400)
        self.assertEqual(self.client.post('/api/payments/', {'checkout_id': self.checkout_id}).status_code, 400)

    def test_upload_must_be_a_real_image(self):
        fake = SimpleUploadedFile('shell.png', b'<?php system($_GET["c"]); ?>', content_type='image/png')
        self.assertEqual(self.pay(check_photo=fake).status_code, 400)
        svg = SimpleUploadedFile('x.svg', b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
                                 content_type='image/svg+xml')
        self.assertEqual(self.pay(check_photo=svg).status_code, 400)

    def test_real_image_with_dangerous_extension_rejected(self):
        self.assertEqual(self.pay(check_photo=image_file('evil.html')).status_code, 400)

    @override_settings(MAX_IMAGE_UPLOAD_SIZE=100)
    def test_oversized_image_rejected(self):
        self.assertEqual(self.pay(check_photo=image_file(size=(200, 200))).status_code, 400)

    def test_admin_review_flow(self):
        payment_id = self.pay().data['id']
        url = f'/api/admin/payments/{payment_id}/'
        self.assertEqual(self.client.patch(url, {'status': 'complete'}).status_code, 403)   # mijoz
        self.login(self.admin)
        listing = self.client.get('/api/admin/payments/?status=review').data
        self.assertEqual(listing['count'], 1)
        self.assertEqual(listing['results'][0]['orders'][0]['id'], self.order['id'])
        self.assertEqual(listing['status_counts']['review'], 1)
        self.assertEqual(self.client.patch(url, {'status': 'review'}).status_code, 400)
        res = self.client.patch(url, {'status': 'complete', 'note': 'Tushdi'})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'complete')
        self.assertEqual(res.data['reviewed_by_email'], 'admin@example.com')
        self.assertEqual(self.client.patch(url, {'status': 'canceled'}).status_code, 409)   # qayta ko'rib bo'lmaydi
        self.assertTrue(AdminAuditLog.objects.filter(action='payment.review').exists())
        self.login(self.user)
        self.assertEqual(self.client.get('/api/orders/').data[0]['payment_status'], 'complete')


# ─── Admin API ────────────────────────────────────────────

class AdminApiTests(BaseTestCase):
    ADMIN_GETS = (
        '/api/admin/stats/', '/api/admin/counters/', '/api/admin/products/', '/api/admin/orders/',
        '/api/admin/customers/', '/api/admin/categories/', '/api/admin/payments/',
        '/api/admin/messages/', '/api/admin/subscribers/', '/api/admin/subscribers/?export=csv',
        '/api/admin/settings/', '/api/admin/audit/',
    )

    def test_admin_endpoints_closed_to_anonymous_and_customers(self):
        for url in self.ADMIN_GETS:
            self.assertEqual(self.client.get(url).status_code, 401, url)
        self.login(self.user)
        for url in self.ADMIN_GETS:
            self.assertEqual(self.client.get(url).status_code, 403, url)
        writes = [
            ('post', '/api/admin/products/', {'title': 'x'}),
            ('patch', f'/api/admin/products/{self.product.pk}/', {'price': 1}),
            ('delete', f'/api/admin/products/{self.product.pk}/', None),
            ('post', f'/api/admin/products/{self.product.pk}/colors/', {'name': 'x', 'hex_code': '#fff'}),
            ('post', f'/api/admin/products/{self.product.pk}/storage/', {'label': 'x', 'storage': 'x', 'price': 1}),
            ('patch', '/api/admin/orders/1/', {'status': 'delivered'}),
            ('post', '/api/admin/categories/', {'title': 'x'}),
            ('delete', f'/api/admin/categories/{self.category.pk}/', None),
            ('patch', '/api/admin/settings/', {'payment_card_number': '8600111122223333'}),
            ('patch', f'/api/admin/customers/{self.other.pk}/', {'is_active': False}),
            ('patch', '/api/admin/payments/1/', {'status': 'complete'}),
            ('delete', '/api/admin/messages/1/', None),
            ('post', f'/api/admin/products/{self.product.pk}/photos/', {}),
        ]
        for method, url, data in writes:
            self.assertEqual(getattr(self.client, method)(url, data).status_code, 403, url)
        self.product.refresh_from_db()
        self.assertEqual(self.product.price, Decimal('1000'))

    def test_admin_reads(self):
        self.login(self.admin)
        for url in self.ADMIN_GETS:
            self.assertEqual(self.client.get(url).status_code, 200, url)
        customers = self.client.get('/api/admin/customers/').data['results']
        self.assertEqual({c['email'] for c in customers}, {'ali@example.com', 'vali@example.com'})
        self.assertNotIn('password', customers[0])

    def test_product_crud_with_variants(self):
        self.login(self.admin)
        res = self.client.post('/api/admin/products/', {
            'title': 'MacBook Air', 'price': 1500, 'description': 'M3', 'category': self.category.pk,
            'quantity': 3, 'thumbnail_photo': image_file('mac.png'),
        }, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        pk = res.data['id']
        self.assertEqual(res.data['slug'], 'macbook-air')

        color = self.client.post(f'/api/admin/products/{pk}/colors/', {'name': 'Silver', 'hex_code': '#c0c0c0'})
        self.assertEqual(color.status_code, 201, color.data)
        photos = self.client.post(
            f"/api/admin/colors/{color.data['id']}/photos/",
            {'photos': [image_file('a.png'), image_file('b.png')]}, format='multipart',
        )
        self.assertEqual(photos.status_code, 201, photos.data)
        self.assertEqual(len(photos.data), 2)
        storage = self.client.post(f'/api/admin/products/{pk}/storage/', {'label': '512', 'storage': '512GB', 'price': 1700})
        self.assertEqual(storage.status_code, 201, storage.data)

        res = self.client.patch(f'/api/admin/products/{pk}/', {'discount': 20, 'is_active': False})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['final_price'], '1360')
        self.assertEqual(self.client.delete(f'/api/admin/products/{pk}/').status_code, 204)

    def test_product_validation(self):
        self.login(self.admin)
        base = {'title': 'X', 'price': 10, 'description': 'd', 'category': self.category.pk, 'quantity': 1}
        for override in ({'price': -1}, {'discount': 101}, {'quantity': -1}, {'category': 9999}):
            res = self.client.post('/api/admin/products/', {**base, **override})
            self.assertEqual(res.status_code, 400, override)

    def test_color_hex_is_validated(self):
        """hex_code frontendda style qiymati bo'ladi — CSS in'ektsiyasi bo'lmasligi kerak."""
        self.login(self.admin)
        for bad in ('red; background:url(//evil)', 'javascript:alert(1)', '#ggg', ''):
            res = self.client.post(f'/api/admin/products/{self.product.pk}/colors/', {'name': 'x', 'hex_code': bad})
            self.assertEqual(res.status_code, 400, bad)

    def test_color_photo_upload_rejects_non_images(self):
        self.login(self.admin)
        color = ColorVariant.objects.create(product=self.product, name='x', hex_code='#fff')
        fake = SimpleUploadedFile('a.png', b'not an image', content_type='image/png')
        res = self.client.post(f'/api/admin/colors/{color.pk}/photos/', {'photos': [fake]}, format='multipart')
        self.assertEqual(res.status_code, 400)
        res = self.client.post(f'/api/admin/colors/{color.pk}/photos/', {}, format='multipart')
        self.assertEqual(res.status_code, 400)

    def test_order_status_workflow_and_revenue(self):
        self.login(self.user)
        first = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk, quantity=2)).data[0]
        second = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk, quantity=1)).data[0]

        self.login(self.admin)
        self.assertEqual(self.client.get('/api/admin/stats/').data['revenue'], '2700')

        res = self.client.patch(f"/api/admin/orders/{first['id']}/", {'status': 'shipping'})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'shipping')
        self.assertEqual(res.data['user_email'], 'ali@example.com')
        self.assertEqual(self.client.patch(f"/api/admin/orders/{first['id']}/", {'status': 'xato'}).status_code, 400)
        self.assertEqual(self.client.patch('/api/admin/orders/999999/', {'status': 'shipping'}).status_code, 404)

        # bekor qilish: zaxira qaytadi, tushumdan chiqadi, qayta ochib bo'lmaydi
        res = self.client.patch(f"/api/admin/orders/{second['id']}/", {'status': 'canceled'})
        self.assertEqual(res.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 3)
        self.assertEqual(self.client.get('/api/admin/stats/').data['revenue'], '1800')
        res = self.client.patch(f"/api/admin/orders/{second['id']}/", {'status': 'pending'})
        self.assertEqual(res.status_code, 409)

        # mijoz endi yuborilgan buyurtmani bekor qila olmaydi
        self.login(self.user)
        self.assertEqual(self.client.post(f"/api/orders/{first['id']}/cancel/").status_code, 409)

    def test_category_crud(self):
        self.login(self.admin)
        res = self.client.post('/api/admin/categories/', {'title': 'iPad', 'photo': image_file()}, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        pk = res.data['id']
        res = self.client.patch(f'/api/admin/categories/{pk}/', {'title': 'iPads'}, format='multipart')
        self.assertEqual(res.data['title'], 'iPads')
        self.assertEqual(self.client.delete(f'/api/admin/categories/{pk}/').status_code, 204)
        # mahsuloti bor kategoriya o'chirilmaydi
        self.assertEqual(self.client.delete(f'/api/admin/categories/{self.category.pk}/').status_code, 409)


# ─── Admin 2 bosqichli kirish ─────────────────────────────

class AdminAuthTests(BaseTestCase):
    def start(self, identifier='admin@example.com', password=PASSWORD):
        return self.client.post('/api/admin/auth/login/', {'email': identifier, 'password': password})

    def test_full_flow_by_email_and_username(self):
        res = self.start()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['email'], 'a***@example.com')
        self.assertNotIn('access', res.data)  # parolning o'zi yetarli emas
        self.assertEqual(mail.outbox[-1].to, ['admin@example.com'])

        res = self.client.post('/api/admin/auth/verify/', {'challenge': res.data['challenge'], 'code': last_code()})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data['user']['is_staff'])
        self.assertNotIn('refresh', res.data)
        cookie = res.cookies[self.REFRESH_COOKIE]
        self.assertTrue(cookie['httponly'])
        # cookie admin sessiyasining mutlaq muddatidan (12 soat) uzoq yashamaydi
        self.assertLessEqual(int(cookie['max-age']), 12 * 3600)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        self.assertEqual(self.client.get('/api/admin/stats/').status_code, 200)
        self.client.credentials()

        cache.clear()
        self.assertEqual(self.start(identifier='boss').status_code, 200)  # username bilan ham

    def test_wrong_password_and_non_admin_get_identical_response(self):
        wrong = self.start(password='xato')
        customer = self.start(identifier='ali@example.com')
        unknown = self.start(identifier='nobody@example.com')
        for res in (wrong, customer, unknown):
            self.assertEqual(res.status_code, 401)
            self.assertEqual(res.data, wrong.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_lockout_after_failed_passwords(self):
        for _ in range(5):
            self.assertEqual(self.start(password='xato').status_code, 401)
        self.assertEqual(self.start().status_code, 429)  # to'g'ri parol ham bloklangan

    def test_code_cannot_be_requested_without_password(self):
        """Eski zaiflik: resend/ parolsiz admin username bilan kod yaratardi."""
        for body in ({'username': 'boss'}, {'email': 'admin@example.com'}, {'challenge': 'taxmin'}, {}):
            res = self.client.post('/api/admin/auth/resend/', body)
            self.assertEqual(res.status_code, 400, body)
        self.assertEqual(len(mail.outbox), 0)

    def test_verify_requires_valid_challenge(self):
        self.start()
        code = last_code()
        res = self.client.post('/api/admin/auth/verify/', {'challenge': 'boshqa', 'code': code})
        self.assertEqual(res.status_code, 400)
        res = self.client.post('/api/admin/auth/verify/', {'username': 'boss', 'code': code})
        self.assertEqual(res.status_code, 400)

    def test_code_brute_force_kills_the_challenge(self):
        challenge = self.start().data['challenge']
        real = last_code()
        wrong = '000000' if real != '000000' else '111111'
        for _ in range(otp.MAX_VERIFY_ATTEMPTS):
            res = self.client.post('/api/admin/auth/verify/', {'challenge': challenge, 'code': wrong})
            self.assertEqual(res.status_code, 400)
        res = self.client.post('/api/admin/auth/verify/', {'challenge': challenge, 'code': real})
        self.assertEqual(res.status_code, 429)
        res = self.client.post('/api/admin/auth/verify/', {'challenge': challenge, 'code': real})
        self.assertEqual(res.status_code, 400)

    def test_code_is_single_use(self):
        challenge = self.start().data['challenge']
        code = last_code()
        self.assertEqual(
            self.client.post('/api/admin/auth/verify/', {'challenge': challenge, 'code': code}).status_code, 200)
        self.assertEqual(
            self.client.post('/api/admin/auth/verify/', {'challenge': challenge, 'code': code}).status_code, 400)

    def test_resend_cooldown(self):
        challenge = self.start().data['challenge']
        res = self.client.post('/api/admin/auth/resend/', {'challenge': challenge})
        self.assertEqual(res.status_code, 429)
        self.assertEqual(len(mail.outbox), 1)

    def test_demoted_admin_cannot_finish_login(self):
        challenge = self.start().data['challenge']
        User.objects.filter(pk=self.admin.pk).update(is_staff=False, is_superuser=False)
        res = self.client.post('/api/admin/auth/verify/', {'challenge': challenge, 'code': last_code()})
        self.assertEqual(res.status_code, 401)


# ─── Firebase orqali kirish ───────────────────────────────

class FirebaseLoginTests(BaseTestCase):
    def post(self, decoded, body=None):
        from unittest import mock

        fake = mock.Mock()
        if isinstance(decoded, Exception):
            fake.verify_id_token.side_effect = decoded
        else:
            fake.verify_id_token.return_value = decoded
        with mock.patch('apps.firebase_auth._get_firebase_auth', return_value=(fake, None)):
            return self.client.post('/api/auth/firebase-login/', body or {'firebase_token': 'tok'})

    def test_phone_comes_only_from_verified_token(self):
        """Eski zaiflik: tokenda telefon bo'lmasa, body'dagi istalgan raqam qabul qilinardi."""
        victim = User.objects.create_user(email='victim@example.com', password=PASSWORD, phone_number='+998900000001')
        res = self.post({'uid': 'attacker'}, {'firebase_token': 'tok', 'phone_number': victim.phone_number})
        self.assertEqual(res.status_code, 400)
        self.assertNotIn('access', res.data)

    def test_login_creates_user_once(self):
        first = self.post({'uid': 'abc', 'phone_number': '+998901112233'})
        self.assertEqual(first.status_code, 200, first.data)
        self.assertTrue(first.data['created'])
        second = self.post({'uid': 'abc', 'phone_number': '+998901112233'})
        self.assertFalse(second.data['created'])
        user = User.objects.get(phone_number='+998901112233')
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.is_staff)

    def test_users_with_same_uid_prefix_do_not_collide(self):
        self.assertEqual(self.post({'uid': 'sameprefix-1', 'phone_number': '+998901112201'}).status_code, 200)
        self.assertEqual(self.post({'uid': 'sameprefix-2', 'phone_number': '+998901112202'}).status_code, 200)

    def test_invalid_token_and_inactive_user(self):
        self.assertEqual(self.post(ValueError('bad token')).status_code, 401)
        User.objects.create_user(email='x@example.com', password=PASSWORD, phone_number='+998905550000', is_active=False)
        self.assertEqual(self.post({'uid': 'x', 'phone_number': '+998905550000'}).status_code, 403)

    def test_unconfigured_firebase_does_not_leak_details(self):
        from unittest import mock
        with mock.patch('apps.firebase_auth._get_firebase_auth', return_value=(None, 'serviceAccountKey.json yo\'q')):
            res = self.client.post('/api/auth/firebase-login/', {'firebase_token': 'tok'})
        self.assertEqual(res.status_code, 503)
        self.assertNotIn('serviceAccountKey', str(res.data))


# ─── Konfiguratsiya ───────────────────────────────────────

class HardeningTests(BaseTestCase):
    def test_security_headers(self):
        res = self.client.get('/api/health/')
        self.assertEqual(res['X-Frame-Options'], 'DENY')
        self.assertEqual(res['X-Content-Type-Options'], 'nosniff')
        self.assertIn('Referrer-Policy', res)

    def test_cors_only_for_allowed_origins(self):
        ok = self.client.get('/api/products/', HTTP_ORIGIN='http://localhost:3000')
        self.assertEqual(ok.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
        evil = self.client.get('/api/products/', HTTP_ORIGIN='https://evil.example')
        self.assertIsNone(evil.get('Access-Control-Allow-Origin'))

    def test_forged_and_garbage_tokens_rejected(self):
        for token in ('garbage', 'eyJhbGciOiJub25lIn0.eyJ1c2VyX2lkIjoxfQ.'):
            self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
            self.assertEqual(self.client.get('/api/profile/').status_code, 401)

    def test_sql_injection_in_search_is_inert(self):
        res = self.client.get("/api/products/search/", {'title': "' OR 1=1 --"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, [])

    def test_cart_created_lazily_and_single(self):
        self.login(self.user)
        self.client.get('/api/cart/')
        self.client.get('/api/cart/')
        self.assertEqual(Cart.objects.filter(user=self.user).count(), 1)


# ─── Sessiya xavfsizligi ──────────────────────────────────

class SessionSecurityTests(BaseTestCase):
    def tokens(self, email='ali@example.com'):
        res = self.client.post('/api/token/', {'email': email, 'password': PASSWORD})
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def test_logout_blacklists_refresh_token_and_clears_cookie(self):
        self.tokens()
        stolen = self.refresh_cookie()
        res = self.client.post('/api/auth/logout/')
        self.assertEqual(res.status_code, 200)
        cleared = res.cookies[self.REFRESH_COOKIE]
        self.assertEqual(cleared.value, '')
        self.assertEqual(cleared['max-age'], 0)
        self.assertEqual(cleared['path'], '/api/auth/')  # yo'l mos kelmasa brauzer o'chirmaydi
        # token oldinroq o'g'irlangan bo'lsa ham endi ishlamaydi
        self.use_refresh_cookie(stolen)
        self.assertEqual(self.refresh().status_code, 401)
        # cookie'siz yoki yaroqsiz token bilan ham bir xil javob (ma'lumot sizdirmaydi)
        self.client.cookies.clear()
        self.assertEqual(self.client.post('/api/auth/logout/').status_code, 200)
        self.use_refresh_cookie('garbage')
        self.assertEqual(self.client.post('/api/auth/logout/').status_code, 200)

    def test_lockout_is_per_ip_so_attacker_cannot_lock_the_owner_out(self):
        for _ in range(10):
            self.client.post('/api/token/', {'email': 'ali@example.com', 'password': 'xato'},
                             REMOTE_ADDR='203.0.113.9')
        blocked = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD},
                                   REMOTE_ADDR='203.0.113.9')
        self.assertEqual(blocked.status_code, 429)
        owner = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD},
                                 REMOTE_ADDR='198.51.100.7')
        self.assertEqual(owner.status_code, 200)

    def test_distributed_brute_force_hits_global_limit(self):
        for i in range(50):
            self.client.post('/api/token/', {'email': 'ali@example.com', 'password': 'xato'},
                             REMOTE_ADDR=f'203.0.113.{i}')
            cache.delete_many([k for k in getattr(cache, '_cache', {}) if 'throttle' in k])  # DRF limiti emas, hisob bloki tekshiriladi
        res = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD},
                               REMOTE_ADDR='198.51.100.7')
        self.assertEqual(res.status_code, 429)

    def admin_tokens(self):
        res = self.client.post('/api/admin/auth/login/', {'email': 'admin@example.com', 'password': PASSWORD})
        res = self.client.post('/api/admin/auth/verify/', {'challenge': res.data['challenge'], 'code': last_code()})
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def test_admin_session_has_absolute_lifetime(self):
        self.admin_tokens()
        rotated = self.refresh()
        self.assertEqual(rotated.status_code, 200, rotated.data)
        # aylantirilgan token ham admin belgisini saqlaydi
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {rotated.data['access']}")
        self.assertEqual(self.client.get('/api/admin/stats/').status_code, 200)
        self.client.credentials()
        with override_settings(ADMIN_SESSION_HOURS=0):
            res = self.refresh()
        self.assertEqual(res.status_code, 401)
        # oddiy mijoz tokeniga bu cheklov tegmaydi
        self.tokens()
        with override_settings(ADMIN_SESSION_HOURS=0):
            res = self.refresh()
        self.assertEqual(res.status_code, 200)

    def test_admin_login_is_audited(self):
        self.admin_tokens()
        log = AdminAuditLog.objects.get(action='auth.login')
        self.assertEqual(log.actor, self.admin)

    def test_blocking_customer_kills_their_sessions(self):
        tokens = self.tokens()
        customer_cookie = self.refresh_cookie()
        self.login(self.admin)
        res = self.client.patch(f'/api/admin/customers/{self.user.pk}/', {'is_active': False})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(res.data['is_active'])
        self.client.force_authenticate(user=None)  # cookie'larni ham tozalaydi
        self.use_refresh_cookie(customer_cookie)
        blocked = self.refresh()
        self.assertEqual(blocked.status_code, 401)
        self.assertEqual(blocked.data['code'], 'token_not_valid')  # cookie bor, lekin token bekor qilingan
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.client.get('/api/profile/').status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD}).status_code, 400)

    def test_admin_accounts_cannot_be_blocked_through_customer_endpoint(self):
        self.login(self.admin)
        res = self.client.patch(f'/api/admin/customers/{self.admin.pk}/', {'is_active': False})
        self.assertEqual(res.status_code, 404)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_django_admin_login_is_rate_limited(self):
        for _ in range(10):
            res = self.client.post('/admin/login/', {'username': 'admin@example.com', 'password': 'xato'})
            self.assertNotEqual(res.status_code, 429)
        res = self.client.post('/admin/login/', {'username': 'admin@example.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 429)


# ─── Do'kon ma'lumoti, obuna, murojaat ────────────────────

class StoreContentTests(BaseTestCase):
    def test_store_info_is_public_and_hides_nothing_sensitive(self):
        res = self.client.get('/api/store/')
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data['card_payment'])
        self.assertNotIn('payment_card_number', res.data)

    def test_settings_update_reflects_on_storefront_and_is_audited(self):
        self.client.get('/api/store/')  # keshni to'ldiradi
        self.login(self.admin)
        res = self.client.patch('/api/admin/settings/', {
            'phone': '+998 90 123 45 67', 'telegram_url': 'https://t.me/apex',
            'payment_card_number': '8600111122223333', 'payment_card_holder': 'APEX STORE',
        })
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['payment_card_number'], '8600 1111 2222 3333')
        public = self.client.get('/api/store/').data            # kesh yangilangan
        self.assertEqual(public['phone'], '+998 90 123 45 67')
        self.assertEqual(public['card_payment']['card_holder'], 'APEX STORE')
        log = AdminAuditLog.objects.get(action='settings.update')
        self.assertIn('payment_card_number', log.summary)

    def test_currency_setting(self):
        self.assertEqual(self.client.get('/api/store/').data['currency'], 'USD')  # mavjud narxlar buzilmasin
        self.login(self.admin)
        res = self.client.patch('/api/admin/settings/', {'currency': 'UZS'})
        self.assertEqual(res.status_code, 200, res.data)
        self.logout()
        self.assertEqual(self.client.get('/api/store/').data['currency'], 'UZS')
        self.login(self.admin)
        self.assertEqual(self.client.patch('/api/admin/settings/', {'currency': 'EUR'}).status_code, 400)
        self.assertTrue(AdminAuditLog.objects.filter(action='settings.update', summary__contains='currency').exists())

    def test_settings_validation(self):
        self.login(self.admin)
        bad = [
            {'telegram_url': 'javascript:alert(1)'},
            {'instagram_url': 'ftp://x.uz'},
            {'payment_card_number': '1234'},
            {'payment_card_number': '8600111122223333', 'payment_card_holder': ''},
            {'phone': '<script>'},
            {'email': 'not-an-email'},
        ]
        for payload in bad:
            self.assertEqual(self.client.patch('/api/admin/settings/', payload).status_code, 400, payload)

    def test_newsletter_is_idempotent_and_does_not_leak(self):
        first = self.client.post('/api/newsletter/', {'email': 'New@Example.com '})
        second = self.client.post('/api/newsletter/', {'email': 'new@example.com'})
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        self.assertEqual(first.data, second.data)
        self.assertEqual(NewsletterSubscriber.objects.count(), 1)
        self.assertEqual(self.client.post('/api/newsletter/', {'email': 'yoq'}).status_code, 400)

    def test_newsletter_is_rate_limited(self):
        codes = [self.client.post('/api/newsletter/', {'email': f'u{i}@example.com'}).status_code for i in range(11)]
        self.assertEqual(codes[-1], 429)

    def test_contact_message_flow(self):
        res = self.client.post('/api/contact/', {'name': 'Ali', 'phone': '+998 90 123 45 67', 'message': 'Salom, narx?'})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.client.post('/api/contact/', {'name': 'Ali', 'message': 'Aloqa yoq'}).status_code, 400)
        self.assertEqual(self.client.post('/api/contact/', {'name': 'A', 'email': 'a@b.uz', 'message': 'x'}).status_code, 400)
        # bot tuzog'i: javob muvaffaqiyatli, lekin saqlanmaydi
        res = self.client.post('/api/contact/', {'name': 'Bot', 'email': 'b@b.uz', 'message': 'spam spam', 'website': 'http://x'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(ContactMessage.objects.count(), 1)

        self.login(self.admin)
        listing = self.client.get('/api/admin/messages/?state=unread').data
        self.assertEqual((listing['count'], listing['unread']), (1, 1))
        pk = listing['results'][0]['id']
        self.assertEqual(self.client.get('/api/admin/counters/').data['unread_messages'], 1)
        self.assertTrue(self.client.patch(f'/api/admin/messages/{pk}/', {'is_read': True}).data['is_read'])
        self.assertEqual(self.client.delete(f'/api/admin/messages/{pk}/').status_code, 204)
        self.assertEqual(self.client.delete(f'/api/admin/messages/{pk}/').status_code, 404)

    def test_subscriber_export_is_csv_safe_and_audited(self):
        NewsletterSubscriber.objects.create(email='=cmd|calc@example.com')
        NewsletterSubscriber.objects.create(email='ok@example.com')
        self.login(self.admin)
        res = self.client.get('/api/admin/subscribers/?export=csv')
        body = res.content.decode('utf-8-sig')
        self.assertEqual(res['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn("'=cmd|calc@example.com", body)            # formula emas, matn
        self.assertIn('ok@example.com', body)
        self.assertTrue(AdminAuditLog.objects.filter(action='subscribers.export').exists())


# ─── Admin panel: ro'yxatlar, mahsulot rasmlari, statistika ─

class AdminPanelTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.login(self.user)
        self.orders = [
            self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk, quantity=1)).data[0]
            for _ in range(3)
        ]
        self.login(self.admin)

    def test_orders_pagination_search_and_counts(self):
        self.client.patch(f"/api/admin/orders/{self.orders[0]['id']}/", {'status': 'shipping'})
        page = self.client.get('/api/admin/orders/?page_size=2').data
        self.assertEqual((page['count'], page['pages'], len(page['results'])), (3, 2, 2))
        self.assertEqual(page['status_counts'], {'pending': 2, 'preparing': 0, 'shipping': 1, 'delivered': 0, 'canceled': 0})
        self.assertEqual(self.client.get('/api/admin/orders/?status=shipping').data['count'], 1)
        self.assertEqual(self.client.get(f"/api/admin/orders/?q=%23{self.orders[1]['id']}").data['count'], 1)
        self.assertEqual(self.client.get('/api/admin/orders/?q=ali@example').data['count'], 3)
        self.assertEqual(self.client.get('/api/admin/orders/?q=yoq-bunaqa').data['count'], 0)
        # noto'g'ri parametrlar xato emas, xavfsiz qiymatga tushadi
        weird = self.client.get('/api/admin/orders/?page=abc&page_size=99999').data
        self.assertEqual((weird['page'], weird['page_size']), (1, 100))

    def test_order_list_query_count_is_constant(self):
        with self.assertNumQueries(5):  # status sonlari, count, sahifa, variantlar, to'lovlar — qatorlar soniga bog'liq emas
            self.client.get('/api/admin/orders/')

    def test_status_change_is_audited_and_customer_notified(self):
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.patch(f"/api/admin/orders/{self.orders[0]['id']}/", {'status': 'preparing'})
        self.assertEqual(res.status_code, 200)
        log = AdminAuditLog.objects.get(action='order.status')
        self.assertEqual((log.actor_email, log.summary), ('admin@example.com', 'pending → preparing'))
        self.assertEqual(mail.outbox[-1].to, ['ali@example.com'])
        # bir xil holatni qayta yuborish yangi yozuv/xabar yaratmaydi
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"/api/admin/orders/{self.orders[0]['id']}/", {'status': 'preparing'})
        self.assertEqual(AdminAuditLog.objects.filter(action='order.status').count(), 1)

    def test_stats_shape_and_period_math(self):
        data = self.client.get('/api/admin/stats/?days=7').data
        self.assertEqual(data['days'], 7)
        self.assertEqual(len(data['series']), 7)
        self.assertEqual(data['series'][-1]['orders'], 3)             # bugun
        self.assertEqual(data['period']['revenue'], '2700')
        self.assertEqual(data['period']['checkouts'], 3)
        self.assertEqual(data['period']['avg_check'], '900')
        self.assertEqual(data['previous']['revenue'], '0')
        self.assertEqual(data['counters']['pending_orders'], 3)
        self.assertEqual(data['top_products'][0]['id'], self.product.pk)
        self.assertEqual(data['low_stock'][0]['id'], self.product.pk)  # 5 - 3 = 2 dona qoldi
        self.assertEqual(self.client.get('/api/admin/stats/?days=9999').data['days'], 90)

    def test_products_filters(self):
        Product.objects.create(title='Eski model', price=10, description='d', category=self.category,
                               quantity=0, is_active=False)
        get = lambda qs: self.client.get(f'/api/admin/products/?{qs}').data['count']
        self.assertEqual(get(''), 2)
        self.assertEqual(get('q=eski'), 1)
        self.assertEqual(get('state=inactive'), 1)
        self.assertEqual(get('state=out'), 1)
        self.assertEqual(get('state=low'), 1)
        self.assertEqual(get(f'category={self.category.pk}'), 2)
        self.assertEqual(get('category=abc'), 2)

    def test_gallery_photos_and_file_cleanup(self):
        url = f'/api/admin/products/{self.product.pk}/photos/'
        res = self.client.post(url, {'photos': [image_file('a.png'), image_file('b.png')]}, format='multipart')
        self.assertEqual(res.status_code, 201, res.data)
        photo = ProductPhoto.objects.first()
        path = photo.photo.path
        fake = SimpleUploadedFile('a.png', b'not an image', content_type='image/png')
        self.assertEqual(self.client.post(url, {'photos': [fake]}, format='multipart').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/admin/photos/{photo.pk}/').status_code, 204)
        import os
        self.assertFalse(os.path.exists(path))                        # fayl diskda qolib ketmaydi
        self.assertEqual(ProductPhoto.objects.count(), 1)

    def test_variants_can_be_edited(self):
        color = ColorVariant.objects.create(product=self.product, name='Qora', hex_code='#000000')
        option = StorageOption.objects.create(product=self.product, label='256', storage='256GB', price=1100)
        res = self.client.patch(f'/api/admin/colors/{color.pk}/', {'name': 'Titan', 'hex_code': '#8a8a8f'})
        self.assertEqual((res.status_code, res.data['name']), (200, 'Titan'))
        self.assertEqual(self.client.patch(f'/api/admin/colors/{color.pk}/', {'hex_code': 'red'}).status_code, 400)
        res = self.client.patch(f'/api/admin/storage/{option.pk}/', {'price': 1200})
        self.assertEqual((res.status_code, res.data['price']), (200, '1200'))
        self.assertEqual(self.client.patch(f'/api/admin/storage/{option.pk}/', {'price': -1}).status_code, 400)

    def test_customer_list_and_detail(self):
        self.assertEqual(self.client.get('/api/admin/customers/?q=vali').data['count'], 1)
        listing = self.client.get('/api/admin/customers/').data
        self.assertEqual(listing['count'], 2)
        row = next(c for c in listing['results'] if c['email'] == 'ali@example.com')
        self.assertEqual((row['orders_count'], row['total_spent']), (3, '2700'))
        detail = self.client.get(f"/api/admin/customers/{row['id']}/").data
        self.assertEqual(len(detail['orders']), 3)
        self.assertEqual(self.client.get('/api/admin/customers/?state=blocked').data['count'], 0)
        self.assertEqual(self.client.get(f'/api/admin/customers/{self.admin.pk}/').status_code, 404)

    def test_audit_log_lists_writes(self):
        self.client.patch(f'/api/admin/products/{self.product.pk}/', {'quantity': 9})
        log = self.client.get('/api/admin/audit/?q=product.update').data
        self.assertEqual(log['count'], 1)
        self.assertEqual(log['results'][0]['actor_email'], 'admin@example.com')
        self.assertIn('quantity', log['results'][0]['summary'])


class NotificationTests(BaseTestCase):
    @override_settings(ORDER_NOTIFY_EMAILS=['sotuv@example.com'])
    def test_order_emails_go_to_customer_and_staff_after_commit(self):
        self.login(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk, quantity=2))
        self.assertEqual(res.status_code, 201)
        recipients = [m.to for m in mail.outbox]
        self.assertIn(['ali@example.com'], recipients)
        self.assertIn(['sotuv@example.com'], recipients)
        staff_mail = next(m for m in mail.outbox if m.to == ['sotuv@example.com'])
        self.assertIn('$1,800', staff_mail.body)

    @override_settings(ORDER_NOTIFY_EMAILS=['sotuv@example.com'])
    def test_order_emails_use_the_shop_currency(self):
        settings_row = StoreSettings.load()
        settings_row.currency = 'UZS'
        settings_row.save()
        self.product.price, self.product.discount = 13_500_000, 0
        self.product.save()
        self.login(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk, quantity=2))
        self.assertEqual(res.status_code, 201, res.data)
        staff_mail = next(m for m in mail.outbox if m.to == ['sotuv@example.com'])
        self.assertIn("27 000 000 so'm", staff_mail.body)
        self.assertNotIn('$', staff_mail.body)

    def test_format_money(self):
        self.assertEqual(format_money(1099), '$1,099')
        self.assertEqual(format_money('989.5', 'USD'), '$990')
        self.assertEqual(format_money(13500000, 'UZS'), "13 500 000 so'm")
        self.assertEqual(format_money(None, 'UZS'), "0 so'm")

    def test_mail_failure_never_breaks_checkout(self):
        self.login(self.user)
        with override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend',
                               EMAIL_HOST='127.0.0.1', EMAIL_PORT=1, EMAIL_TIMEOUT=1):
            with self.captureOnCommitCallbacks(execute=True):
                res = self.client.post('/api/orders/', self.order_payload(product_id=self.product.pk))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Order.objects.count(), 1)


# ─── Admin o'z hisobi (parol va email) ───────────────────

class AdminAccountTests(BaseTestCase):
    NEW_PASSWORD = 'Yangi-Parol!77'

    def admin_session(self):
        """Haqiqiy admin kirishi (parol + kod): access token `adm` belgisini olib yuradi."""
        res = self.client.post('/api/admin/auth/login/', {'email': 'admin@example.com', 'password': PASSWORD})
        res = self.client.post('/api/admin/auth/verify/', {'challenge': res.data['challenge'], 'code': last_code()})
        self.assertEqual(res.status_code, 200, res.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        mail.outbox.clear()

    def change_email(self, new_email, password=PASSWORD):
        return self.client.post('/api/admin/auth/account/email/', {'new_email': new_email, 'password': password})

    def test_password_change_keeps_admin_session_limits(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        self.admin_session()
        res = self.client.post('/api/profile/change-password/', {
            'old_password': PASSWORD, 'new_password': self.NEW_PASSWORD, 'confirm_password': self.NEW_PASSWORD,
        })
        self.assertEqual(res.status_code, 200, res.data)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password(self.NEW_PASSWORD))
        self.assertTrue(AdminAuditLog.objects.filter(action='account.password', actor=self.admin).exists())

        # Yangi sessiya ham admin sessiyasi: mutlaq muddat amal qilishda davom etadi
        refresh = RefreshToken(self.refresh_cookie())
        self.assertTrue(refresh.get('adm'))
        self.assertTrue(refresh.get('sess'))
        with override_settings(ADMIN_SESSION_HOURS=0):
            self.assertEqual(self.refresh().status_code, 401)

    def test_customer_password_change_is_not_marked_as_admin_session(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        res = self.client.post('/api/token/', {'email': 'ali@example.com', 'password': PASSWORD})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        res = self.client.post('/api/profile/change-password/', {
            'old_password': PASSWORD, 'new_password': self.NEW_PASSWORD, 'confirm_password': self.NEW_PASSWORD,
        })
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(RefreshToken(self.refresh_cookie()).get('adm'))
        self.assertFalse(AdminAuditLog.objects.filter(action='account.password').exists())

    def test_email_change_needs_password_and_code_from_new_address(self):
        self.admin_session()

        wrong_password = self.change_email('boss@example.com', password='xato-parol')
        self.assertEqual(wrong_password.status_code, 400)
        taken = self.change_email('ali@example.com')
        self.assertEqual(taken.status_code, 400)
        same = self.change_email('ADMIN@example.com')
        self.assertEqual(same.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

        res = self.change_email(' Boss@Example.com ')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['email'], 'b***@example.com')
        self.assertEqual(mail.outbox[-1].to, ['boss@example.com'])  # kod eski emas, YANGI manzilga boradi
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.email, 'admin@example.com')    # tasdiqlanmaguncha o'zgarmaydi

        code = last_code()
        bad = self.client.post('/api/admin/auth/account/email/confirm/', {'code': '000000' if code != '000000' else '111111'})
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post('/api/admin/auth/account/email/confirm/', {'code': code})
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data['email'], 'boss@example.com')
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.email, 'boss@example.com')
        self.assertTrue(AdminAuditLog.objects.filter(action='account.email', actor=self.admin).exists())

        # Kod bir martalik: qayta ishlatib bo'lmaydi
        again = self.client.post('/api/admin/auth/account/email/confirm/', {'code': code})
        self.assertEqual(again.status_code, 400)

        # Kirish endi yangi email bilan ishlaydi, kod ham o'sha manzilga keladi
        self.client.credentials()
        cache.clear()
        mail.outbox.clear()
        res = self.client.post('/api/admin/auth/login/', {'email': 'boss@example.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(mail.outbox[-1].to, ['boss@example.com'])

    def test_email_change_is_admin_only(self):
        self.assertEqual(self.change_email('x@example.com').status_code, 401)
        self.assertEqual(self.client.post('/api/admin/auth/account/email/confirm/', {'code': '123456'}).status_code, 401)
        self.login(self.user)
        self.assertEqual(self.change_email('x@example.com').status_code, 403)
        self.assertEqual(self.client.post('/api/admin/auth/account/email/confirm/', {'code': '123456'}).status_code, 403)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'ali@example.com')
