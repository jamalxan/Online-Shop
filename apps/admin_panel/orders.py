from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response

from apps import notifications, services
from apps.admin_panel.common import AdminAPIView, audit, paginate
from apps.models import Order, StoreSettings
from apps.serializers import AdminOrderSerializer


def admin_orders():
    return (
        Order.objects.select_related('product__category', 'user')
        .prefetch_related('product__storage_options')
    )


def orders_json(request, orders) -> list:
    return AdminOrderSerializer(
        orders, many=True,
        context={
            'request': request,
            'payment_status': services.payment_status_by_checkout(o.checkout_id for o in orders),
        },
    ).data


def search_orders(queryset, q: str):
    q = (q or '').strip()[:100]
    if not q:
        return queryset
    condition = (
        Q(first_name__icontains=q) | Q(phone_number__icontains=q)
        | Q(user__email__icontains=q) | Q(product__title__icontains=q)
    )
    number = q.lstrip('#')
    if number.isdigit():
        condition |= Q(pk=int(number))
    return queryset.filter(condition)


class AdminOrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)


@extend_schema(tags=['Admin'])
class AdminOrderListAPIView(AdminAPIView):
    @extend_schema(summary="Buyurtmalar (?status=&q=&page=&page_size=)")
    def get(self, request):
        orders = search_orders(admin_orders(), request.query_params.get('q'))
        # Yorliqlardagi sonlar qidiruvni hisobga oladi, lekin tanlangan statusni emas
        status_counts = {value: 0 for value in Order.Status.values}
        for row in orders.order_by().values('status').annotate(total=Count('id')):
            status_counts[row['status']] = row['total']
        status_filter = request.query_params.get('status')
        if status_filter in Order.Status.values:
            orders = orders.filter(status=status_filter)
        return paginate(
            request, orders, lambda items: orders_json(request, items),
            extra={'status_counts': status_counts},
        )


@extend_schema(tags=['Admin'])
class AdminOrderDetailAPIView(AdminAPIView):
    @extend_schema(responses=AdminOrderSerializer, summary="Buyurtma (admin)")
    def get(self, request, pk):
        order = admin_orders().filter(pk=pk).first()
        if not order:
            return Response({'error': 'Buyurtma topilmadi'}, status=404)
        return Response(orders_json(request, [order])[0])

    @extend_schema(request=AdminOrderStatusSerializer, responses=AdminOrderSerializer,
                   summary="Buyurtma holatini o'zgartirish")
    def patch(self, request, pk):
        ser = AdminOrderStatusSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        previous = Order.objects.filter(pk=pk).values_list('status', flat=True).first()
        try:
            services.change_order_status(pk, ser.validated_data['status'])
        except services.ShopError as exc:
            return Response({'error': exc.message}, status=exc.status)
        order = admin_orders().get(pk=pk)
        if previous != order.status:
            audit(request, 'order.status', order, f"{previous} → {order.status}")
            notifications.notify_order_status(order, StoreSettings.load().store_name)
        return Response(orders_json(request, [order])[0])
