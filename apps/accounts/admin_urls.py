"""apps/accounts/admin_urls.py"""
from django.urls import path
from .admin_auth import (
    AdminEmailChangeConfirmView, AdminEmailChangeView, AdminLoginView, AdminResendOtpView, AdminVerifyOtpView,
)

urlpatterns = [
    path("login/",  AdminLoginView.as_view(),    name="admin-login"),
    path("verify/", AdminVerifyOtpView.as_view(), name="admin-verify-otp"),
    path("resend/", AdminResendOtpView.as_view(), name="admin-resend-otp"),
    # Admin o'z hisobi (kirgan holda): emailni almashtirish
    path("account/email/", AdminEmailChangeView.as_view(), name="admin-email-change"),
    path("account/email/confirm/", AdminEmailChangeConfirmView.as_view(), name="admin-email-change-confirm"),
]
