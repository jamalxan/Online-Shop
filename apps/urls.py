from django.urls import path

from apps.catalog import ProductFacetsAPIView, ProductListAPIView
from apps.firebase_auth import FirebaseLoginAPIView
from apps.site_views import ContactMessageAPIView, NewsletterSubscribeAPIView, StoreInfoAPIView
from apps.views import (
    EmailTokenObtainPairView, CookieTokenRefreshView, LogoutAPIView,
    RegisterAPIView, VerifyEmailAPIView, VerifyOtpAPIView,
    ForgotPasswordAPIView, ForgotPasswordVerifyAPIView, ResetPasswordAPIView,
    ProductDetailAPIView, ProductSearchAPIView,
    CategoryListAPIView, CategoryDetailAPIView,
    ProfileAPIView, ChangePasswordAPIView, CartAPIView, CartItemAPIView, WishlistAPIView,
    OrderListCreateAPIView, OrderDetailAPIView, OrderCancelAPIView,
    PaymentListCreateAPIView, PaymentReceiptAPIView,
)

urlpatterns = [
    # ─── Auth ──────────────────────────────────────────────
    path('auth/register/', RegisterAPIView.as_view()),
    path('auth/verify-email/', VerifyEmailAPIView.as_view()),
    path('auth/verify-otp/', VerifyOtpAPIView.as_view()),
    path('auth/forgot-password/', ForgotPasswordAPIView.as_view()),
    path('auth/forgot-password-verify/', ForgotPasswordVerifyAPIView.as_view()),
    path('auth/reset-password/', ResetPasswordAPIView.as_view()),
    path('auth/firebase-login/', FirebaseLoginAPIView.as_view()),
    # Refresh token cookie'si faqat /api/auth/ yo'liga yuboriladi — shu ikkisi uni o'qiydi
    path('auth/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutAPIView.as_view()),

    path('token/', EmailTokenObtainPairView.as_view(), name='token_obtain'),

    # ─── Katalog ───────────────────────────────────────────
    path('products/', ProductListAPIView.as_view()),
    path('products/facets/', ProductFacetsAPIView.as_view()),
    path('products/search/', ProductSearchAPIView.as_view()),
    path('products/<int:pk>/', ProductDetailAPIView.as_view()),
    path('categories/', CategoryListAPIView.as_view()),
    path('categories/<int:pk>/', CategoryDetailAPIView.as_view()),

    # ─── Profil (JWT) ──────────────────────────────────────
    path('profile/', ProfileAPIView.as_view()),
    path('profile/change-password/', ChangePasswordAPIView.as_view()),

    # ─── Savat / sevimlilar (JWT) ──────────────────────────
    path('cart/', CartAPIView.as_view()),
    path('cart/<int:pk>/', CartItemAPIView.as_view()),
    path('wishlist/', WishlistAPIView.as_view()),

    # ─── Buyurtma / to'lov (JWT) ───────────────────────────
    path('orders/', OrderListCreateAPIView.as_view()),
    path('orders/<int:pk>/', OrderDetailAPIView.as_view()),
    path('orders/<int:pk>/cancel/', OrderCancelAPIView.as_view()),
    path('payments/', PaymentListCreateAPIView.as_view()),
    path('payments/<int:pk>/receipt/', PaymentReceiptAPIView.as_view()),

    # ─── Do'kon ma'lumoti, obuna, murojaat (ochiq) ─────────
    path('store/', StoreInfoAPIView.as_view()),
    path('newsletter/', NewsletterSubscribeAPIView.as_view()),
    path('contact/', ContactMessageAPIView.as_view()),
]
