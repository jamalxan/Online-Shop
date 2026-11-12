"""Murojaatlar, obunachilar, do'kon sozlamalari va audit jurnali."""
import csv
import re

from django.db.models import Q
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response

from apps.admin_panel.common import AdminAPIView, audit, not_found, paginate
from apps.models import AdminAuditLog, ContactMessage, NewsletterSubscriber, StoreSettings
from apps.utils import csv_safe

MAX_EXPORT_ROWS = 50_000


# ─── Murojaatlar ──────────────────────────────────────────

class AdminMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ('id', 'name', 'email', 'phone', 'subject', 'message', 'is_read', 'created_at')


class AdminMessageUpdateSerializer(serializers.Serializer):
    is_read = serializers.BooleanField()


@extend_schema(tags=['Admin'])
class AdminMessageListAPIView(AdminAPIView):
    @extend_schema(summary="Murojaatlar (?state=unread|read&page=)")
    def get(self, request):
        messages = ContactMessage.objects.all()
        state = request.query_params.get('state')
        if state == 'unread':
            messages = messages.filter(is_read=False)
        elif state == 'read':
            messages = messages.filter(is_read=True)
        return paginate(
            request, messages, lambda items: AdminMessageSerializer(items, many=True).data,
            extra={'unread': ContactMessage.objects.filter(is_read=False).count()},
        )


@extend_schema(tags=['Admin'])
class AdminMessageDetailAPIView(AdminAPIView):
    @extend_schema(request=AdminMessageUpdateSerializer, summary="O'qilgan / o'qilmagan deb belgilash")
    def patch(self, request, pk):
        message = ContactMessage.objects.filter(pk=pk).first()
        if not message:
            return not_found('Murojaat topilmadi')
        ser = AdminMessageUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        message.is_read = ser.validated_data['is_read']
        message.save(update_fields=['is_read'])
        return Response(AdminMessageSerializer(message).data)

    @extend_schema(summary="Murojaatni o'chirish")
    def delete(self, request, pk):
        message = ContactMessage.objects.filter(pk=pk).first()
        if not message:
            return not_found('Murojaat topilmadi')
        message.delete()
        audit(request, 'message.delete', None, f"#{pk}")
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Obunachilar ──────────────────────────────────────────

class AdminSubscriberSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsletterSubscriber
        fields = ('id', 'email', 'is_active', 'created_at')


@extend_schema(tags=['Admin'])
class AdminSubscriberListAPIView(AdminAPIView):
    @extend_schema(summary="Obunachilar (?q=&page=) yoki CSV (?export=csv)")
    def get(self, request):
        subscribers = NewsletterSubscriber.objects.all()
        q = (request.query_params.get('q') or '').strip()[:100]
        if q:
            subscribers = subscribers.filter(Q(email__icontains=q))
        if request.query_params.get('export') == 'csv':
            # Shaxsiy ma'lumot eksporti — kim va qachon yuklab olgani jurnalda qoladi
            audit(request, 'subscribers.export', None, f"{subscribers.filter(is_active=True).count()} ta manzil")
            response = HttpResponse(content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="subscribers.csv"'
            response.write('﻿')  # Excel UTF-8 ni to'g'ri ochishi uchun
            writer = csv.writer(response)
            writer.writerow(['email', 'obuna_sanasi'])
            for email, created in subscribers.filter(is_active=True).values_list('email', 'created_at')[:MAX_EXPORT_ROWS]:
                writer.writerow([csv_safe(email), created.strftime('%Y-%m-%d')])
            return response
        return paginate(request, subscribers, lambda items: AdminSubscriberSerializer(items, many=True).data)


@extend_schema(tags=['Admin'])
class AdminSubscriberDetailAPIView(AdminAPIView):
    @extend_schema(summary="Obunachini o'chirish")
    def delete(self, request, pk):
        deleted, _ = NewsletterSubscriber.objects.filter(pk=pk).delete()
        if not deleted:
            return not_found('Obunachi topilmadi')
        audit(request, 'subscriber.delete', None, f"#{pk}")
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Do'kon sozlamalari ───────────────────────────────────

PHONE_DISPLAY_RE = re.compile(r'^\+?[\d\s\-()]{7,30}$')


class AdminStoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreSettings
        fields = (
            'store_name', 'currency', 'phone', 'phone_secondary', 'email', 'address', 'working_hours',
            'telegram_url', 'instagram_url', 'delivery_note',
            'payment_card_number', 'payment_card_holder', 'updated_at',
        )
        read_only_fields = ('updated_at',)

    def _phone(self, value):
        value = (value or '').strip()
        if value and not PHONE_DISPLAY_RE.match(value):
            raise serializers.ValidationError("Telefon raqami noto'g'ri formatda")
        return value

    validate_phone = _phone
    validate_phone_secondary = _phone

    def _link(self, value):
        # Bu qiymat saytda <a href> ga qo'yiladi — faqat http(s) havolaga ruxsat
        value = (value or '').strip()
        if value and not re.match(r'^https?://', value, re.IGNORECASE):
            raise serializers.ValidationError("Havola https:// bilan boshlanishi kerak")
        return value

    validate_telegram_url = _link
    validate_instagram_url = _link

    def validate_payment_card_number(self, value):
        digits = re.sub(r'[\s\-]', '', value or '')
        if not digits:
            return ''
        if not re.fullmatch(r'\d{16}', digits):
            raise serializers.ValidationError("Karta raqami 16 ta raqamdan iborat bo'lishi kerak")
        return ' '.join(digits[i:i + 4] for i in range(0, 16, 4))

    def validate(self, data):
        number = data.get('payment_card_number', getattr(self.instance, 'payment_card_number', ''))
        holder = data.get('payment_card_holder', getattr(self.instance, 'payment_card_holder', ''))
        if number and not (holder or '').strip():
            raise serializers.ValidationError({'payment_card_holder': "Karta egasining ismini kiriting"})
        return data


@extend_schema(tags=['Admin'])
class AdminStoreSettingsAPIView(AdminAPIView):
    @extend_schema(responses=AdminStoreSettingsSerializer, summary="Do'kon sozlamalari")
    def get(self, request):
        return Response(AdminStoreSettingsSerializer(StoreSettings.load()).data)

    @extend_schema(request=AdminStoreSettingsSerializer, responses=AdminStoreSettingsSerializer,
                   summary="Do'kon sozlamalarini yangilash")
    def patch(self, request):
        settings_obj = StoreSettings.load()
        ser = AdminStoreSettingsSerializer(settings_obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        changed = sorted(
            name for name, value in ser.validated_data.items() if getattr(settings_obj, name) != value
        )
        ser.save()
        if changed:
            # To'lov kartasini almashtirish — pulni boshqa hisobga yo'naltirish demak: albatta jurnalga
            audit(request, 'settings.update', settings_obj, ', '.join(changed))
        return Response(AdminStoreSettingsSerializer(settings_obj).data)


# ─── Audit jurnali ────────────────────────────────────────

class AdminAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdminAuditLog
        fields = ('id', 'actor_email', 'action', 'object_type', 'object_id', 'summary', 'ip', 'created_at')


@extend_schema(tags=['Admin'])
class AdminAuditLogListAPIView(AdminAPIView):
    @extend_schema(summary="Audit jurnali (?q=&page=)")
    def get(self, request):
        logs = AdminAuditLog.objects.all()
        q = (request.query_params.get('q') or '').strip()[:100]
        if q:
            logs = logs.filter(Q(action__icontains=q) | Q(actor_email__icontains=q) | Q(summary__icontains=q))
        return paginate(request, logs, lambda items: AdminAuditLogSerializer(items, many=True).data)
