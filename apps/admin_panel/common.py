import logging

from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.models import AdminAuditLog
from apps.utils import client_ip

logger = logging.getLogger('apps.admin')

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


class AdminAPIView(APIView):
    """Barcha admin endpointlar uchun asos: ruxsat bitta joyda, unutib qo'yib bo'lmaydi."""
    permission_classes = (IsAdminUser,)


def not_found(message: str = 'Topilmadi') -> Response:
    return Response({'error': message}, status=status.HTTP_404_NOT_FOUND)


def audit(request, action: str, obj=None, summary: str = '') -> None:
    """
    Admin amalini jurnalga yozadi. Jurnal yozilmasa ham asosiy amal to'xtamaydi,
    lekin xato logga tushadi.
    """
    try:
        AdminAuditLog.objects.create(
            actor=request.user,
            actor_email=getattr(request.user, 'email', '') or '',
            action=action,
            object_type=obj.__class__.__name__ if obj is not None else '',
            object_id=str(obj.pk) if obj is not None and obj.pk is not None else '',
            summary=(summary or '')[:300],
            ip=client_ip(request) or None,
        )
    except Exception:
        logger.exception("Audit yozuvini saqlab bo'lmadi: action=%s", action)


def _int_param(request, name: str, default: int, low: int, high: int) -> int:
    try:
        value = int(request.query_params.get(name, default))
    except (TypeError, ValueError):
        return default
    return max(low, min(high, value))


def int_param(request, name: str, default: int, low: int, high: int) -> int:
    return _int_param(request, name, default, low, high)


def paginate(request, queryset, serialize, extra: dict | None = None) -> Response:
    """
    {count, page, page_size, pages, results, ...extra}
    `serialize(items)` sahifadagi obyektlar ro'yxatini JSON'ga aylantiradi.
    """
    page_size = _int_param(request, 'page_size', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    count = queryset.count()
    pages = max(1, -(-count // page_size))
    page = _int_param(request, 'page', 1, 1, pages)
    start = (page - 1) * page_size
    items = list(queryset[start:start + page_size])
    payload = {'count': count, 'page': page, 'page_size': page_size, 'pages': pages, 'results': serialize(items)}
    if extra:
        payload.update(extra)
    return Response(payload)


def delete_file(field_file) -> None:
    """Qator o'chirilganda/almashtirilganda diskdagi faylni ham o'chiradi (yetim fayl qolmasin)."""
    if not field_file:
        return
    try:
        field_file.storage.delete(field_file.name)
    except Exception:
        logger.warning("Faylni o'chirib bo'lmadi")
