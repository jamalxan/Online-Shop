"""
Ommaviy katalog: filtr, saralash va sahifalash server tomonda.

Ilgari /api/products/ barcha mahsulotni bitta javobda qaytarar, filtr va saralash brauzerda
bajarilardi. Katalog o'sgani sari har bir tashrif butun jadvalni tortib olardi — bu ham sekin,
ham arzon DoS nuqtasi. Endi javob hajmi doim cheklangan (ko'pi bilan PAGE_SIZE_MAX ta).
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.core.cache import cache
from django.db.models import (
    DecimalField, Exists, ExpressionWrapper, F, Max, Min, OuterRef, Q, Subquery, Value,
)
from django.db.models.functions import Coalesce
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.models import ColorVariant, Product, StorageOption
from apps.serializers import ProductListSerializer

PAGE_SIZE_DEFAULT = 24
PAGE_SIZE_MAX = 60
MAX_PRICE_RANGES = 6
FACETS_CACHE_SECONDS = 60

ORDERINGS = {
    'new': ('-created_at', '-id'),
    'price_asc': ('effective_price', 'id'),
    'price_desc': ('-effective_price', '-id'),
    'discount': ('-discount', '-created_at', '-id'),
}


def with_effective_price(queryset):
    """
    Product.final_price bilan bir xil qoida, lekin SQL'da: eng arzon xotira varianti
    (bo'lsa) yoki asosiy narx — chegirma bilan. Narx bo'yicha filtr va saralash shunga tayanadi.
    """
    cheapest_option = (
        StorageOption.objects.filter(product=OuterRef('pk'))
        .order_by().values('product').annotate(lowest=Min('price')).values('lowest')
    )
    base = Coalesce(
        Subquery(cheapest_option, output_field=DecimalField(max_digits=14, decimal_places=0)), F('price'),
    )
    return queryset.annotate(effective_price=ExpressionWrapper(
        base * (Value(100) - F('discount')) / Value(100),
        output_field=DecimalField(max_digits=18, decimal_places=2),
    ))


def parse_price_ranges(raw: str) -> list[tuple[Decimal | None, Decimal | None]]:
    """ "0-500,1000-2000,2000-" → [(0, 500), (1000, 2000), (2000, None)] """
    ranges = []
    for chunk in filter(None, (part.strip() for part in raw.split(','))):
        low, sep, high = chunk.partition('-')
        if not sep:
            raise serializers.ValidationError("Narx oralig'i 'dan-gacha' ko'rinishida bo'lishi kerak.")
        try:
            bounds = tuple(Decimal(value) if value.strip() else None for value in (low, high))
        except InvalidOperation:
            raise serializers.ValidationError("Narx oralig'ida faqat son bo'lishi mumkin.")
        if any(bound is not None and (not bound.is_finite() or bound < 0) for bound in bounds):
            raise serializers.ValidationError("Narx manfiy bo'lishi mumkin emas.")
        if bounds == (None, None):
            continue
        ranges.append(bounds)
    if len(ranges) > MAX_PRICE_RANGES:
        raise serializers.ValidationError(f"Ko'pi bilan {MAX_PRICE_RANGES} ta narx oralig'i.")
    return ranges


class CatalogQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=True, max_length=100)
    category = serializers.IntegerField(required=False, min_value=1)
    exclude = serializers.IntegerField(required=False, min_value=1)
    ordering = serializers.ChoiceField(choices=tuple(ORDERINGS), required=False, default='new')
    in_stock = serializers.BooleanField(required=False, default=False)
    on_sale = serializers.BooleanField(required=False, default=False)
    price = serializers.CharField(required=False, allow_blank=True, max_length=160)
    storage = serializers.ListField(
        child=serializers.CharField(max_length=50), required=False, max_length=12,
    )
    color = serializers.ListField(
        child=serializers.CharField(max_length=100), required=False, max_length=12,
    )
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    page_size = serializers.IntegerField(
        required=False, min_value=1, max_value=PAGE_SIZE_MAX, default=PAGE_SIZE_DEFAULT,
    )

    def validate_price(self, value):
        return parse_price_ranges(value)


def scoped_products(params: dict):
    """Faol mahsulotlar: faqat "qayerda qidiryapmiz" (kategoriya, qidiruv so'zi) qo'llangan."""
    queryset = Product.objects.filter(is_active=True)
    if params.get('category'):
        queryset = queryset.filter(category_id=params['category'])
    if params.get('q', '').strip():
        queryset = queryset.filter(title__icontains=params['q'].strip())
    return queryset


def filtered_products(params: dict):
    queryset = with_effective_price(scoped_products(params))
    if params.get('exclude'):
        queryset = queryset.exclude(pk=params['exclude'])
    if params.get('in_stock'):
        queryset = queryset.filter(quantity__gt=0)
    if params.get('on_sale'):
        queryset = queryset.filter(discount__gt=0)
    # Exists: JOIN'dan farqli o'laroq bir nechta varianti mos kelgan mahsulotni takrorlamaydi
    if params.get('storage'):
        queryset = queryset.filter(Exists(
            StorageOption.objects.filter(product=OuterRef('pk'), storage__in=params['storage'])
        ))
    if params.get('color'):
        queryset = queryset.filter(Exists(
            ColorVariant.objects.filter(product=OuterRef('pk'), name__in=params['color'])
        ))
    ranges = params.get('price') or []
    if ranges:
        condition = Q()
        for low, high in ranges:
            clause = Q()
            if low is not None:
                clause &= Q(effective_price__gte=low)
            if high is not None:
                clause &= Q(effective_price__lte=high)
            condition |= clause
        queryset = queryset.filter(condition)
    return queryset.order_by(*ORDERINGS[params.get('ordering') or 'new'])


def _validated(request) -> dict:
    serializer = CatalogQuerySerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


@extend_schema(tags=['Products'], parameters=[CatalogQuerySerializer], summary="Mahsulotlar (filtr + sahifalash)")
class ProductListAPIView(APIView):
    """{count, page, page_size, pages, results}. Chegaradan tashqari sahifa oxirgi sahifaga tenglanadi."""
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get(self, request):
        params = _validated(request)
        queryset = filtered_products(params)
        count = queryset.count()
        page_size = params['page_size']
        pages = max(1, -(-count // page_size))
        page = min(params['page'], pages)
        start = (page - 1) * page_size
        items = queryset.select_related('category').prefetch_related('storage_options')[start:start + page_size]
        return Response({
            'count': count, 'page': page, 'page_size': page_size, 'pages': pages,
            'results': ProductListSerializer(items, many=True, context={'request': request}).data,
        })


def _round_price(value) -> int | None:
    return None if value is None else int(Decimal(value).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def build_facets(params: dict) -> dict:
    scope = scoped_products(params)
    product_ids = scope.values('pk')
    colors = {}
    for name, hex_code in (
        ColorVariant.objects.filter(product__in=product_ids).order_by('name').values_list('name', 'hex_code')
    ):
        colors.setdefault(name, hex_code)
    prices = with_effective_price(scope).aggregate(lowest=Min('effective_price'), highest=Max('effective_price'))
    return {
        'count': scope.count(),
        'min_price': _round_price(prices['lowest']),
        'max_price': _round_price(prices['highest']),
        'storages': list(
            StorageOption.objects.filter(product__in=product_ids)
            .order_by('storage').values_list('storage', flat=True).distinct()
        ),
        'colors': [{'name': name, 'hex_code': hex_code} for name, hex_code in colors.items()],
    }


@extend_schema(tags=['Products'], summary="Filtr variantlari (xotira, rang, narx chegarasi)")
class ProductFacetsAPIView(APIView):
    """
    Filtr paneli uchun: shu kategoriya / qidiruv doirasida qanday xotira hajmi va ranglar bor.
    Tanlangan filtrlarga bog'liq emas — aks holda bitta variant tanlansa qolganlari yo'qolib qolardi.
    """
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get(self, request):
        params = _validated(request)
        search = params.get('q', '').strip()
        if search:
            return Response(build_facets(params))  # erkin matn — kalitlar soni cheksiz, keshlanmaydi
        key = f"catalog_facets:{params.get('category') or 0}"
        facets = cache.get(key)
        if facets is None:
            facets = build_facets(params)
            cache.set(key, facets, FACETS_CACHE_SECONDS)
        return Response(facets)
