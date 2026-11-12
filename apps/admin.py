from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.models import (
    User, Category, Product, ProductPhoto, ColorVariant, StorageOption,
    Order, OrderHistory, Payment, Cart, CartItem, Wishlist,
    StoreSettings, NewsletterSubscriber, ContactMessage, AdminAuditLog,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ('email',)
    list_display = ('email', 'first_name', 'last_name', 'phone_number', 'is_staff', 'is_active')
    search_fields = ('email', 'first_name', 'last_name', 'phone_number')
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Shaxsiy ma\'lumot', {'fields': ('first_name', 'last_name', 'username', 'phone_number')}),
        ('Huquqlar', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Muhim sanalar', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2'),
        }),
    )


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'title')
    search_fields = ('title',)


class ColorVariantInline(admin.TabularInline):
    model = ColorVariant
    extra = 0


class StorageOptionInline(admin.TabularInline):
    model = StorageOption
    extra = 0


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'price', 'discount', 'quantity', 'category', 'is_active', 'created_at')
    list_filter = ('category', 'is_active')
    list_select_related = ('category',)
    search_fields = ('title',)
    inlines = (StorageOptionInline, ColorVariantInline)


@admin.register(ProductPhoto)
class ProductPhotoAdmin(admin.ModelAdmin):
    list_display = ('id', 'product')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'product', 'quantity', 'total_price', 'status', 'created_at')
    list_filter = ('status', 'delivery_method')
    list_select_related = ('user', 'product')
    search_fields = ('first_name', 'phone_number')
    readonly_fields = ('checkout_id', 'unit_price', 'total_price', 'storage_label', 'color_name')


@admin.register(OrderHistory)
class OrderHistoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'product', 'status', 'created_at')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'amount', 'status', 'type', 'created_at')
    list_filter = ('status', 'type')


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'updated_at')


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'cart', 'product', 'quantity', 'added_at')


@admin.register(Wishlist)
class WishlistAdmin(admin.ModelAdmin):
    list_display = ('id', 'user')
    filter_horizontal = ('products',)



@admin.register(StoreSettings)
class StoreSettingsAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not StoreSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(NewsletterSubscriber)
class NewsletterSubscriberAdmin(admin.ModelAdmin):
    list_display = ('email', 'is_active', 'created_at')
    search_fields = ('email',)


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ('name', 'subject', 'is_read', 'created_at')
    list_filter = ('is_read',)
    search_fields = ('name', 'email', 'phone', 'subject')


@admin.register(AdminAuditLog)
class AdminAuditLogAdmin(admin.ModelAdmin):
    """Jurnal faqat o'qiladi: yozuvni o'zgartirish yoki o'chirish mumkin emas."""
    list_display = ('created_at', 'actor_email', 'action', 'object_type', 'object_id', 'ip')
    list_filter = ('action',)
    search_fields = ('actor_email', 'summary')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
