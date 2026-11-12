# APEX Store — o'rnatish va ishga tushirish

Django REST backend (`apps/`, `OnlineShop/`) va Next.js frontend (`app/`, `components/`, `lib/`) bitta repozitoriyda.

## Backend

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # Mac/Linux

pip install -r requirements.txt
cp .env.example .env            # qiymatlarni to'ldiring
python manage.py migrate
python manage.py createsuperuser   # email + kuchli parol
python manage.py runserver         # http://localhost:8000
```

- `DB_NAME` bo'sh bo'lsa SQLite ishlatiladi; Postgres uchun `DB_*` qiymatlarini to'ldiring.
- Redis OTP kodlar va rate-limit uchun kerak (`DEBUG=True` da Redis bo'lmasa ham ishlaydi).
- Swagger hujjatlari faqat `DEBUG=True` da: http://localhost:8000/
- Kod yangilangandan keyin har doim: `python manage.py migrate`.

## Frontend

```bash
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                        # http://localhost:3000
```

## Sessiya (kirish) qanday ishlaydi

- **Refresh token** (7 kun) brauzerda `httpOnly` cookie'da turadi: JavaScript uni o'qiy olmaydi,
  u faqat `/api/auth/refresh/` va `/api/auth/logout/` ga yuboriladi. **Access token** (15 daqiqa)
  faqat sahifa xotirasida — `localStorage`da hech qanday token yo'q. Sahifa yuklanganda frontend
  cookie orqali yangi access token oladi; har yangilashda refresh token almashtiriladi, eskisi
  bekor qilinadi.
- Frontend va backend **bitta asosiy domenda** bo'lishi kerak: `shop.uz` + `api.shop.uz`
  (lokalda `localhost:3000` + `localhost:8000`). Shunda `AUTH_COOKIE_SAMESITE=Lax` yetarli.
  Lokalda birini `localhost`, ikkinchisini `127.0.0.1` deb ochmang — brauzer uchun bular boshqa
  sayt, cookie yuborilmaydi va sahifa yangilanganda hisobdan chiqib ketadi.
- Butunlay boshqa domenlar (masalan `*.vercel.app` + alohida API) uchun
  `AUTH_COOKIE_SAMESITE=None` kerak bo'ladi, lekin Safari va Chrome'ning "third-party cookie"
  cheklovlari tufayli bu ishonchsiz — tavsiya etilmaydi.
- `CORS_ALLOWED_ORIGINS` aniq frontend manzili bo'lishi shart: cookie faqat shu manzillardan
  kelgan so'rovlarda qabul qilinadi (`DEBUG=True` da `localhost`ning istalgan porti ruxsat etilgan).

## Katalog API

- `GET /api/products/` har doim sahifalangan: `{count, page, pages, page_size, results}`,
  `page_size` ko'pi bilan 60. Parametrlar: `q`, `category`, `ordering` (`new`, `price_asc`,
  `price_desc`, `discount`), `in_stock`, `on_sale`, `price` (`0-500,2000-`), `storage`, `color`, `exclude`.
- `GET /api/products/facets/` — filtr paneli uchun mavjud xotira hajmlari, ranglar, narx chegarasi.
- `GET /api/categories/<id>/` endi mahsulotlar ro'yxatini qaytarmaydi (`product_count` bor);
  mahsulotlar uchun `/api/products/?category=<id>`.
- Saytdagi filtrlar URL'da yashaydi (`/products?sort=price_asc&stock=1&page=2`) — havolani ulashish mumkin.

## Valyuta

**Admin → Sozlamalar → Narxlar valyutasi**: `USD` ("$1,099") yoki `UZS` ("13 500 000 so'm").
Bu faqat ko'rsatish formatini o'zgartiradi — narxlar **qayta hisoblanmaydi**. So'mga o'tishdan
oldin mahsulot (va xotira variantlari) narxlarini so'mda qayta kiriting. Sayt keshi tufayli
o'zgarish mijozlarga 1 daqiqagacha kechikib ko'rinadi; admin panelda darhol.

## Testlar

```bash
# Backend (SQLite + xotiradagi kesh bilan; Postgres/Redis kerak emas)
DB_NAME= python manage.py test            # bash
$env:DB_NAME=''; python manage.py test    # PowerShell

# Frontend
npm run typecheck && npm run lint && npm run build
```

## Admin panel

- Kirish: `/admin/login` — parol, so'ng emailga kelgan 6 xonali kod. Sessiya 12 soatdan keyin
  tugaydi (`ADMIN_SESSION_HOURS`), "Chiqish" bosilganda token serverda bekor qilinadi.
- Admin (`is_staff`) hisoblar oddiy `/api/token/` orqali kira olmaydi (`ADMIN_OTP_REQUIRED=True`).
- Bo'limlar: Dashboard (tushum grafigi, KPI, navbatdagi ishlar), Buyurtmalar, To'lovlar,
  Mijozlar, Mahsulotlar, Kategoriyalar, Murojaatlar (+ obunachilar), Sozlamalar (+ faoliyat jurnali).
- Har bir o'zgartirish **audit jurnaliga** yoziladi: kim, nima, qachon, qaysi IP'dan
  (Sozlamalar → Faoliyat jurnali). Jurnalni admin paneldan o'zgartirib yoki o'chirib bo'lmaydi.
- Django admin (`/admin/`, backend domenida) faqat `DEBUG=True` da yoki
  `DJANGO_ADMIN_ENABLED=True` bo'lsa ishlaydi — u yerda email kod yo'q, shuning uchun
  production'da sukut bo'yicha o'chiq.

## Do'kon sozlamalari va to'lov

- Telefon, email, manzil, ish vaqti, Telegram/Instagram — **Admin → Sozlamalar**da kiritiladi.
  Bo'sh maydon saytda ko'rsatilmaydi (kodda soxta raqam/manzil yo'q).
- **Kartaga o'tkazma**: Sozlamalarda karta raqami kiritilsa, mijoz "Buyurtmalarim" sahifasida
  shu kartani va summani ko'radi, chek rasmini yuklaydi. Admin **To'lovlar** bo'limida tasdiqlaydi
  yoki sababini yozib rad etadi. Karta bo'sh bo'lsa, bu usul o'chiq (to'lov faqat qabul qilganda).
- Summa mijozdan olinmaydi — serverda buyurtmalardan hisoblanadi. Cheklar `private_media/` da,
  `/media/` dan tashqarida saqlanadi va faqat egasi yoki adminga token bilan beriladi.

## Bildirishnomalar

- Yangi buyurtmada mijozga email ketadi; `ORDER_NOTIFY_EMAILS` to'ldirilsa xodimlarga ham.
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` berilsa, yangi buyurtma Telegram'ga ham yuboriladi.
- Admin holatni o'zgartirganda mijozga email boradi. Xabar yuborilmasa ham buyurtma saqlanadi
  (xato faqat logga yoziladi).

## Kontent

Bosh sahifadan uydirma ma'lumotlar olib tashlangan: soxta mijoz sharhlari, "10K+ mijoz",
"Certified Apple Reseller", bo'lib to'lash rejalari, trade-in va price-match. Tizimda bunday
funksiyalar yo'q edi, shuning uchun tegishli komponentlar ham o'chirilgan (git tarixida bor).
Bunday bloklarni faqat haqiqiy ma'lumot bilan qayta qo'shing.

## Production uchun tekshiruv ro'yxati

1. `DEBUG=False`, yangi kuchli `SECRET_KEY`, `ALLOWED_HOSTS` — haqiqiy domen.
2. `CORS_ALLOWED_ORIGINS` — frontend domeni (https), `CSRF_TRUSTED_ORIGINS` — backend domeni.
   Frontend va API bitta asosiy domenda (`shop.uz` + `api.shop.uz`) — sessiya cookie'si shunga tayanadi.
3. Postgres (`DB_*`) va Redis (`REDIS_*`, parol bilan) sozlangan; `python manage.py migrate` bajarilgan.
4. SMTP sozlangan (`EMAIL_HOST_USER`, `GMAIL_APP_PASSWORD`).
5. HTTPS: nginx `X-Forwarded-Proto` sarlavhasini uzatadi; `NUM_PROXIES=1`.
6. `python manage.py collectstatic`; `/static/` va `/media/` ni nginx tarqatadi
   (Django `DEBUG=False` da media bermaydi). `private_media/` (to'lov cheklari) ni nginx
   konfiguratsiyasiga **qo'shmang** va zaxira nusxaga kiriting.
7. WSGI server: `gunicorn OnlineShop.wsgi` (Linux) — `runserver` production uchun emas.
8. `python manage.py check --deploy` ogohlantirishsiz o'tadi.
9. Har kuni `python manage.py flushexpiredtokens` (cron). Refresh token har sahifa yuklanishida
   almashadi, shuning uchun bu jadval tez o'sadi — tozalanmasa kirish sekinlashadi.
10. Frontend `NEXT_PUBLIC_API_URL` build paytida beriladi — Content-Security-Policy shu manzilga
    qarab tuziladi (`next.config.mjs`). API domeni o'zgarsa, frontendni qayta build qiling.
11. Admin → Sozlamalar to'ldirilgan (aloqa ma'lumotlari, kerak bo'lsa to'lov kartasi).
