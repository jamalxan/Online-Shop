from decimal import Decimal

from django.db.models import Count, Q, Sum
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response

from apps.admin_panel.common import AdminAPIView, audit, not_found, paginate
from apps.admin_panel.orders import admin_orders, orders_json
from apps.models import Order, User
from apps.views import revoke_refresh_tokens

NOT_CANCELED = ~Q(orders__status=Order.Status.CANCELED)


def customers():
    # Admin hisoblar bu yerda umuman ko'rinmaydi va bu endpoint orqali o'zgartirilmaydi
    return User.objects.filter(is_staff=False, is_superuser=False)


class AdminCustomerSerializer(serializers.ModelSerializer):
    orders_count = serializers.IntegerField(read_only=True)
    total_spent = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'first_name', 'last_name', 'email', 'phone_number',
                  'date_joined', 'last_login', 'is_active', 'orders_count', 'total_spent')

    def get_total_spent(self, obj) -> str:
        return str(getattr(obj, 'total_spent', None) or Decimal('0'))


class AdminCustomerUpdateSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


@extend_schema(tags=['Admin'])
class AdminCustomerListAPIView(AdminAPIView):
    @extend_schema(summary="Mijozlar (?q=&state=active|blocked&page=)")
    def get(self, request):
        users = customers()
        q = (request.query_params.get('q') or '').strip()[:100]
        if q:
            users = users.filter(
                Q(email__icontains=q) | Q(first_name__icontains=q)
                | Q(last_name__icontains=q) | Q(phone_number__icontains=q)
            )
        state = request.query_params.get('state')
        if state == 'active':
            users = users.filter(is_active=True)
        elif state == 'blocked':
            users = users.filter(is_active=False)
        users = users.annotate(
            orders_count=Count('orders', distinct=True),
            total_spent=Sum('orders__total_price', filter=NOT_CANCELED),
        ).order_by('-date_joined', '-id')
        return paginate(request, users, lambda items: AdminCustomerSerializer(items, many=True).data)


@extend_schema(tags=['Admin'])
class AdminCustomerDetailAPIView(AdminAPIView):
    def _get(self, pk):
        return customers().annotate(
            orders_count=Count('orders', distinct=True),
            total_spent=Sum('orders__total_price', filter=NOT_CANCELED),
        ).filter(pk=pk).first()

    @extend_schema(summary="Mijoz va uning oxirgi buyurtmalari")
    def get(self, request, pk):
        user = self._get(pk)
        if not user:
            return not_found('Mijoz topilmadi')
        orders = list(admin_orders().filter(user=user)[:20])
        return Response({**AdminCustomerSerializer(user).data, 'orders': orders_json(request, orders)})

    @extend_schema(request=AdminCustomerUpdateSerializer, summary="Mijozni bloklash / blokdan chiqarish")
    def patch(self, request, pk):
        user = customers().filter(pk=pk).first()
        if not user:
            return not_found('Mijoz topilmadi')
        ser = AdminCustomerUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        is_active = ser.validated_data['is_active']
        if user.is_active != is_active:
            user.is_active = is_active
            user.save(update_fields=['is_active'])
            if not is_active:
                # Bloklangan mijozning ochiq sessiyalari darhol yopiladi
                revoke_refresh_tokens(user)
            audit(request, 'customer.unblock' if is_active else 'customer.block', user, f"user_id={user.pk}")
        return Response(AdminCustomerSerializer(self._get(pk)).data)
