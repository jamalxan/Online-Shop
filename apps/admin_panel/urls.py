from django.urls import path

from apps.admin_panel.content import (
    AdminAuditLogListAPIView, AdminMessageDetailAPIView, AdminMessageListAPIView,
    AdminStoreSettingsAPIView, AdminSubscriberDetailAPIView, AdminSubscriberListAPIView,
)
from apps.admin_panel.customers import AdminCustomerDetailAPIView, AdminCustomerListAPIView
from apps.admin_panel.orders import AdminOrderDetailAPIView, AdminOrderListAPIView
from apps.admin_panel.payments import AdminPaymentDetailAPIView, AdminPaymentListAPIView
from apps.admin_panel.products import (
    AdminCategoryDetailAPIView, AdminCategoryListCreateAPIView,
    AdminColorPhotoDetailAPIView, AdminColorPhotoUploadAPIView,
    AdminColorVariantCreateAPIView, AdminColorVariantDetailAPIView,
    AdminProductDetailAPIView, AdminProductListCreateAPIView,
    AdminProductPhotoDetailAPIView, AdminProductPhotoUploadAPIView,
    AdminStorageOptionCreateAPIView, AdminStorageOptionDetailAPIView,
)
from apps.admin_panel.stats import AdminCountersAPIView, AdminStatsAPIView

urlpatterns = [
    path('stats/', AdminStatsAPIView.as_view()),
    path('counters/', AdminCountersAPIView.as_view()),

    path('products/', AdminProductListCreateAPIView.as_view()),
    path('products/<int:pk>/', AdminProductDetailAPIView.as_view()),
    path('products/<int:pk>/photos/', AdminProductPhotoUploadAPIView.as_view()),
    path('products/<int:pk>/colors/', AdminColorVariantCreateAPIView.as_view()),
    path('products/<int:pk>/storage/', AdminStorageOptionCreateAPIView.as_view()),
    path('photos/<int:pk>/', AdminProductPhotoDetailAPIView.as_view()),
    path('colors/<int:pk>/', AdminColorVariantDetailAPIView.as_view()),
    path('colors/<int:pk>/photos/', AdminColorPhotoUploadAPIView.as_view()),
    path('color-photos/<int:pk>/', AdminColorPhotoDetailAPIView.as_view()),
    path('storage/<int:pk>/', AdminStorageOptionDetailAPIView.as_view()),

    path('categories/', AdminCategoryListCreateAPIView.as_view()),
    path('categories/<int:pk>/', AdminCategoryDetailAPIView.as_view()),

    path('orders/', AdminOrderListAPIView.as_view()),
    path('orders/<int:pk>/', AdminOrderDetailAPIView.as_view()),

    path('customers/', AdminCustomerListAPIView.as_view()),
    path('customers/<int:pk>/', AdminCustomerDetailAPIView.as_view()),

    path('payments/', AdminPaymentListAPIView.as_view()),
    path('payments/<int:pk>/', AdminPaymentDetailAPIView.as_view()),

    path('messages/', AdminMessageListAPIView.as_view()),
    path('messages/<int:pk>/', AdminMessageDetailAPIView.as_view()),
    path('subscribers/', AdminSubscriberListAPIView.as_view()),
    path('subscribers/<int:pk>/', AdminSubscriberDetailAPIView.as_view()),

    path('settings/', AdminStoreSettingsAPIView.as_view()),
    path('audit/', AdminAuditLogListAPIView.as_view()),
]
