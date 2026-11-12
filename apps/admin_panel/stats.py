from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response

from apps import services
from apps.admin_panel.common import AdminAPIView, int_param
from apps.models import ContactMessage, Order, Payment, Product, User
from apps.serializers import AdminOrderSerializer

LOW_STOCK_THRESHOLD = 5


def _day_start(day):
    """Kun boshi (do'kon vaqt zonasida) — indeksdan foydalanadigan chegaraviy qiymat."""
    return timezone.make_aware(datetime.combine(day, time.min))


def _totals(queryset) -> dict:
    data = queryset.aggregate(
        revenue=Sum('total_price'), orders=Count('id'), checkouts=Count('checkout_id', distinct=True),
    )
    revenue = data['revenue'] or Decimal('0')
    checkouts = data['checkouts'] or 0
    return {
        'revenue': str(revenue),
        'orders': data['orders'] or 0,
        'checkouts': checkouts,
        'avg_check': str((revenue / checkouts).quantize(Decimal('1'))) if checkouts else '0',
    }


def counters() -> dict:
    return {
        'pending_orders': Order.objects.filter(status=Order.Status.PENDING).count(),
        'payments_review': Payment.objects.filter(status=Payment.PayStatus.REVIEW).count(),
        'unread_messages': ContactMessage.objects.filter(is_read=False).count(),
    }


@extend_schema(tags=['Admin'])
class AdminCountersAPIView(AdminAPIView):
    @extend_schema(summary="Navbatdagi ishlar soni (menyu belgilari uchun)")
    def get(self, request):
        return Response(counters())


@extend_schema(tags=['Admin'])
class AdminStatsAPIView(AdminAPIView):
    @extend_schema(summary="Dashboard statistikasi (?days=7..90)")
    def get(self, request):
        days = int_param(request, 'days', 30, 7, 90)
        today = timezone.localdate()
        start = today - timedelta(days=days - 1)
        start_dt = _day_start(start)
        prev_dt = _day_start(start - timedelta(days=days))

        valid = Order.objects.exclude(status=Order.Status.CANCELED)
        period = valid.filter(created_at__gte=start_dt)
        previous = valid.filter(created_at__gte=prev_dt, created_at__lt=start_dt)

        # Kunlik qator: buyurtma bo'lmagan kunlar ham 0 bilan qaytadi
        by_day = {
            row['day']: row for row in
            period.annotate(day=TruncDate('created_at')).values('day')
            .annotate(revenue=Sum('total_price'), orders=Count('id'))
        }
        series = []
        for offset in range(days):
            day = start + timedelta(days=offset)
            row = by_day.get(day)
            series.append({
                'date': day.isoformat(),
                'revenue': str(row['revenue'] or 0) if row else '0',
                'orders': row['orders'] if row else 0,
            })

        status_counts = {value: 0 for value in Order.Status.values}
        for row in Order.objects.values('status').annotate(total=Count('id')):
            status_counts[row['status']] = row['total']

        top_products = [
            {'id': row['product_id'], 'title': row['product__title'],
             'quantity': row['qty'] or 0, 'revenue': str(row['revenue'] or 0)}
            for row in period.values('product_id', 'product__title')
            .annotate(qty=Sum('quantity'), revenue=Sum('total_price')).order_by('-revenue')[:5]
        ]
        low_stock = [
            {'id': p.pk, 'title': p.title, 'quantity': p.quantity,
             'thumbnail_photo': request.build_absolute_uri(p.thumbnail_photo.url) if p.thumbnail_photo else None}
            for p in Product.objects.filter(is_active=True, quantity__lte=LOW_STOCK_THRESHOLD)
            .order_by('quantity', 'id')[:8]
        ]

        recent = list(
            Order.objects.select_related('product__category', 'user')
            .prefetch_related('product__storage_options')[:8]
        )
        customers = User.objects.filter(is_staff=False)
        # Tushum buyurtma paytida saqlangan narxdan hisoblanadi (mahsulotning joriy narxidan emas)
        revenue_total = valid.aggregate(total=Sum('total_price'))['total'] or Decimal('0')
        return Response({
            'days': days,
            'revenue': str(revenue_total),
            'total_products': Product.objects.count(),
            'total_orders': Order.objects.count(),
            'total_users': customers.count(),
            'period': {**_totals(period), 'new_customers': customers.filter(date_joined__gte=start_dt).count()},
            'previous': {
                **_totals(previous),
                'new_customers': customers.filter(date_joined__gte=prev_dt, date_joined__lt=start_dt).count(),
            },
            'series': series,
            'status_counts': status_counts,
            'top_products': top_products,
            'low_stock': low_stock,
            'low_stock_threshold': LOW_STOCK_THRESHOLD,
            'counters': counters(),
            'recent_orders': AdminOrderSerializer(
                recent, many=True,
                context={
                    'request': request,
                    'payment_status': services.payment_status_by_checkout(o.checkout_id for o in recent),
                },
            ).data,
        })
