from collections import defaultdict

from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response

from apps import services
from apps.admin_panel.common import AdminAPIView, audit, paginate
from apps.models import Order, Payment
from apps.serializers import PaymentSerializer


class AdminPaymentSerializer(PaymentSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True, default=None)
    user_name = serializers.SerializerMethodField()
    reviewed_by_email = serializers.CharField(source='reviewed_by.email', read_only=True, default=None)
    orders = serializers.SerializerMethodField()

    class Meta(PaymentSerializer.Meta):
        fields = PaymentSerializer.Meta.fields + ('user_email', 'user_name', 'reviewed_by_email', 'orders')

    def get_user_name(self, obj) -> str:
        if not obj.user_id:
            return ''
        return ' '.join(part for part in (obj.user.first_name, obj.user.last_name) if part)

    def get_orders(self, obj) -> list:
        return (self.context.get('orders_by_checkout') or {}).get(obj.checkout_id, [])


class AdminPaymentReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=(Payment.PayStatus.COMPLETED, Payment.PayStatus.CANCELED))
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')


def payments_json(request, payments) -> list:
    """To'lovga tegishli buyurtmalar bitta so'rov bilan yuklanadi (N+1 emas)."""
    by_checkout = defaultdict(list)
    checkout_ids = {p.checkout_id for p in payments if p.checkout_id}
    if checkout_ids:
        rows = Order.objects.filter(checkout_id__in=checkout_ids).select_related('product').order_by('id')
        for order in rows:
            by_checkout[order.checkout_id].append({
                'id': order.pk, 'title': order.product.title, 'quantity': order.quantity,
                'total_price': str(order.total_price), 'usd_rate': order.usd_rate, 'status': order.status,
            })
    return AdminPaymentSerializer(
        payments, many=True, context={'request': request, 'orders_by_checkout': by_checkout},
    ).data


@extend_schema(tags=['Admin'])
class AdminPaymentListAPIView(AdminAPIView):
    @extend_schema(summary="To'lovlar (?status=review|complete|canceled&page=)")
    def get(self, request):
        payments = Payment.objects.select_related('user', 'reviewed_by')
        status_counts = {value: 0 for value in Payment.PayStatus.values}
        for row in Payment.objects.values('status').annotate(total=Count('id')):
            status_counts[row['status']] = row['total']
        status_filter = request.query_params.get('status')
        if status_filter in Payment.PayStatus.values:
            payments = payments.filter(status=status_filter)
        return paginate(
            request, payments, lambda items: payments_json(request, items),
            extra={'status_counts': status_counts},
        )


@extend_schema(tags=['Admin'])
class AdminPaymentDetailAPIView(AdminAPIView):
    @extend_schema(request=AdminPaymentReviewSerializer, summary="To'lovni tasdiqlash yoki rad etish")
    def patch(self, request, pk):
        ser = AdminPaymentReviewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            payment = services.review_payment(
                pk, ser.validated_data['status'], request.user, ser.validated_data['note'],
            )
        except services.ShopError as exc:
            return Response({'error': exc.message}, status=exc.status)
        audit(request, 'payment.review', payment, f"{payment.status}, summa={payment.amount}")
        payment = Payment.objects.select_related('user', 'reviewed_by').get(pk=pk)
        return Response(payments_json(request, [payment])[0])
