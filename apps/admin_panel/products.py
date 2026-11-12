from django.db import transaction
from django.db.models import Count, ProtectedError, Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.admin_panel.common import AdminAPIView, audit, delete_file, not_found, paginate
from apps.admin_panel.stats import LOW_STOCK_THRESHOLD
from apps.models import Category, ColorVariant, ColorVariantPhoto, Product, ProductPhoto, StorageOption
from apps.serializers import (
    HEX_RE, CategorySerializer, ColorVariantSerializer, ProductDetailSerializer, ProductPhotoSerializer,
    StorageOptionSerializer, validate_image,
)

MAX_PHOTOS_PER_UPLOAD = 10
MAX_PHOTOS_PER_PRODUCT = 30


def admin_products():
    return Product.objects.select_related('category').prefetch_related(
        'photos', 'color_variants__photos', 'storage_options'
    )


def product_json(request, pk) -> dict:
    return ProductDetailSerializer(admin_products().get(pk=pk), context={'request': request}).data


class PhotoUploadSerializer(serializers.Serializer):
    photos = serializers.ListField(
        child=serializers.ImageField(validators=[validate_image]),
        min_length=1, max_length=MAX_PHOTOS_PER_UPLOAD,
    )


# ─── Products ─────────────────────────────────────────────

class AdminProductSerializer(serializers.ModelSerializer):
    thumbnail_photo = serializers.ImageField(required=False, allow_null=True, validators=[validate_image])

    class Meta:
        model = Product
        fields = ('title', 'price', 'discount', 'description', 'category',
                  'quantity', 'thumbnail_photo', 'is_active')
        extra_kwargs = {
            'discount': {'required': False},
            'is_active': {'required': False},
        }


@extend_schema(tags=['Admin'])
class AdminProductListCreateAPIView(AdminAPIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @extend_schema(summary="Mahsulotlar (?q=&category=&state=active|inactive|low|out&page=)")
    def get(self, request):
        products = admin_products()
        q = (request.query_params.get('q') or '').strip()[:100]
        if q:
            products = products.filter(Q(title__icontains=q) | Q(category__title__icontains=q))
        category = request.query_params.get('category')
        if category and category.isdigit():
            products = products.filter(category_id=int(category))
        state = request.query_params.get('state')
        if state == 'active':
            products = products.filter(is_active=True)
        elif state == 'inactive':
            products = products.filter(is_active=False)
        elif state == 'low':
            products = products.filter(quantity__gt=0, quantity__lte=LOW_STOCK_THRESHOLD)
        elif state == 'out':
            products = products.filter(quantity=0)
        return paginate(
            request, products,
            lambda items: ProductDetailSerializer(items, many=True, context={'request': request}).data,
        )

    @extend_schema(request=AdminProductSerializer, responses=ProductDetailSerializer, summary="Mahsulot yaratish")
    def post(self, request):
        ser = AdminProductSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        product = ser.save()
        audit(request, 'product.create', product, product.title)
        return Response(product_json(request, product.pk), status=status.HTTP_201_CREATED)


@extend_schema(tags=['Admin'])
class AdminProductDetailAPIView(AdminAPIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @extend_schema(responses=ProductDetailSerializer, summary="Mahsulot (admin)")
    def get(self, request, pk):
        if not Product.objects.filter(pk=pk).exists():
            return not_found()
        return Response(product_json(request, pk))

    @extend_schema(request=AdminProductSerializer, responses=ProductDetailSerializer, summary="Mahsulot yangilash")
    def patch(self, request, pk):
        product = Product.objects.filter(pk=pk).first()
        if not product:
            return not_found()
        old_thumbnail = product.thumbnail_photo.name if product.thumbnail_photo else ''
        ser = AdminProductSerializer(product, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        changed = sorted(ser.validated_data.keys())
        product = ser.save()
        if old_thumbnail and (not product.thumbnail_photo or product.thumbnail_photo.name != old_thumbnail):
            product.thumbnail_photo.storage.delete(old_thumbnail)
        audit(request, 'product.update', product, f"{product.title}: {', '.join(changed)}")
        return Response(product_json(request, pk))

    @extend_schema(summary="Mahsulot o'chirish")
    def delete(self, request, pk):
        product = admin_products().filter(pk=pk).first()
        if not product:
            return not_found()
        files = [product.thumbnail_photo] + [p.photo for p in product.photos.all()] + [
            p.photo for variant in product.color_variants.all() for p in variant.photos.all()
        ]
        title = product.title
        try:
            with transaction.atomic():
                product.delete()
        except ProtectedError:
            return Response(
                {'error': "Bu mahsulotga buyurtmalar bog'langan — o'chirib bo'lmaydi. "
                          "Uni sotuvdan olish uchun \"Faol\" belgisini o'chiring."},
                status=status.HTTP_409_CONFLICT,
            )
        for field_file in files:
            delete_file(field_file)
        audit(request, 'product.delete', None, f"#{pk} {title}")
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Gallery photos ───────────────────────────────────────

@extend_schema(tags=['Admin'])
class AdminProductPhotoUploadAPIView(AdminAPIView):
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(request=PhotoUploadSerializer, summary="Mahsulot galereyasiga rasmlar yuklash")
    def post(self, request, pk):
        product = Product.objects.filter(pk=pk).first()
        if not product:
            return not_found('Mahsulot topilmadi')
        ser = PhotoUploadSerializer(data={'photos': request.FILES.getlist('photos')})
        ser.is_valid(raise_exception=True)
        photos = ser.validated_data['photos']
        if product.photos.count() + len(photos) > MAX_PHOTOS_PER_PRODUCT:
            return Response(
                {'error': f"Bitta mahsulotga ko'pi bilan {MAX_PHOTOS_PER_PRODUCT} ta rasm yuklash mumkin"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        created = [ProductPhoto.objects.create(product=product, photo=f) for f in photos]
        audit(request, 'product.photos_add', product, f"{product.title}: +{len(created)} rasm")
        return Response(
            ProductPhotoSerializer(created, many=True, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=['Admin'])
class AdminProductPhotoDetailAPIView(AdminAPIView):
    @extend_schema(summary="Galereya rasmini o'chirish")
    def delete(self, request, pk):
        photo = ProductPhoto.objects.select_related('product').filter(pk=pk).first()
        if not photo:
            return not_found('Rasm topilmadi')
        product, field_file = photo.product, photo.photo
        photo.delete()
        delete_file(field_file)
        audit(request, 'product.photo_delete', product, product.title)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Color variants ───────────────────────────────────────

class ColorVariantWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ColorVariant
        fields = ('name', 'hex_code', 'order')
        extra_kwargs = {'order': {'required': False}}

    def validate_hex_code(self, value):
        # hex_code frontendda CSS qiymati sifatida ishlatiladi — faqat haqiqiy rang kodi
        if not HEX_RE.match(value):
            raise serializers.ValidationError("Rang kodi #RRGGBB formatida bo'lishi kerak")
        return value


@extend_schema(tags=['Admin'])
class AdminColorVariantCreateAPIView(AdminAPIView):
    @extend_schema(request=ColorVariantWriteSerializer, responses=ColorVariantSerializer,
                   summary="Rang varianti qo'shish")
    def post(self, request, pk):
        product = Product.objects.filter(pk=pk).first()
        if not product:
            return not_found('Mahsulot topilmadi')
        ser = ColorVariantWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        variant = ser.save(product=product)
        audit(request, 'product.color_add', product, f"{product.title}: {variant.name}")
        return Response(
            ColorVariantSerializer(variant, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=['Admin'])
class AdminColorVariantDetailAPIView(AdminAPIView):
    @extend_schema(request=ColorVariantWriteSerializer, responses=ColorVariantSerializer,
                   summary="Rang variantini tahrirlash")
    def patch(self, request, pk):
        variant = ColorVariant.objects.select_related('product').filter(pk=pk).first()
        if not variant:
            return not_found('Rang varianti topilmadi')
        ser = ColorVariantWriteSerializer(variant, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        variant = ser.save()
        audit(request, 'product.color_update', variant.product, f"{variant.product.title}: {variant.name}")
        return Response(ColorVariantSerializer(variant, context={'request': request}).data)

    @extend_schema(summary="Rang variantini o'chirish")
    def delete(self, request, pk):
        variant = ColorVariant.objects.select_related('product').prefetch_related('photos').filter(pk=pk).first()
        if not variant:
            return not_found('Rang varianti topilmadi')
        files = [p.photo for p in variant.photos.all()]
        product, name = variant.product, variant.name
        variant.delete()
        for field_file in files:
            delete_file(field_file)
        audit(request, 'product.color_delete', product, f"{product.title}: {name}")
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=['Admin'])
class AdminColorPhotoUploadAPIView(AdminAPIView):
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(request=PhotoUploadSerializer, summary="Rang rasmlari yuklash (bir nechta)")
    def post(self, request, pk):
        variant = ColorVariant.objects.select_related('product').filter(pk=pk).first()
        if not variant:
            return not_found('Rang varianti topilmadi')
        ser = PhotoUploadSerializer(data={'photos': request.FILES.getlist('photos')})
        ser.is_valid(raise_exception=True)
        start = variant.photos.count()
        if start + len(ser.validated_data['photos']) > MAX_PHOTOS_PER_PRODUCT:
            return Response(
                {'error': f"Bitta rangga ko'pi bilan {MAX_PHOTOS_PER_PRODUCT} ta rasm yuklash mumkin"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        created = []
        for i, f in enumerate(ser.validated_data['photos']):
            photo = ColorVariantPhoto.objects.create(variant=variant, photo=f, order=start + i)
            created.append({'id': photo.id, 'photo': request.build_absolute_uri(photo.photo.url)})
        audit(request, 'product.color_photos_add', variant.product,
              f"{variant.product.title} / {variant.name}: +{len(created)} rasm")
        return Response(created, status=status.HTTP_201_CREATED)


@extend_schema(tags=['Admin'])
class AdminColorPhotoDetailAPIView(AdminAPIView):
    @extend_schema(summary="Rang rasmini o'chirish")
    def delete(self, request, pk):
        photo = ColorVariantPhoto.objects.select_related('variant__product').filter(pk=pk).first()
        if not photo:
            return not_found('Rasm topilmadi')
        product, field_file = photo.variant.product, photo.photo
        photo.delete()
        delete_file(field_file)
        audit(request, 'product.color_photo_delete', product, product.title)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Storage options ──────────────────────────────────────

class StorageOptionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageOption
        fields = ('label', 'storage', 'ram', 'price', 'order')
        extra_kwargs = {'ram': {'required': False}, 'order': {'required': False}}


@extend_schema(tags=['Admin'])
class AdminStorageOptionCreateAPIView(AdminAPIView):
    @extend_schema(request=StorageOptionWriteSerializer, responses=StorageOptionSerializer,
                   summary="Xotira varianti qo'shish")
    def post(self, request, pk):
        product = Product.objects.filter(pk=pk).first()
        if not product:
            return not_found('Mahsulot topilmadi')
        ser = StorageOptionWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        option = ser.save(product=product)
        audit(request, 'product.storage_add', product, f"{product.title}: {option.label}")
        return Response(StorageOptionSerializer(option).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=['Admin'])
class AdminStorageOptionDetailAPIView(AdminAPIView):
    @extend_schema(request=StorageOptionWriteSerializer, responses=StorageOptionSerializer,
                   summary="Xotira variantini tahrirlash")
    def patch(self, request, pk):
        option = StorageOption.objects.select_related('product').filter(pk=pk).first()
        if not option:
            return not_found('Xotira varianti topilmadi')
        ser = StorageOptionWriteSerializer(option, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        option = ser.save()
        audit(request, 'product.storage_update', option.product, f"{option.product.title}: {option.label}")
        return Response(StorageOptionSerializer(option).data)

    @extend_schema(summary="Xotira variantini o'chirish")
    def delete(self, request, pk):
        option = StorageOption.objects.select_related('product').filter(pk=pk).first()
        if not option:
            return not_found('Xotira varianti topilmadi')
        product, label = option.product, option.label
        option.delete()
        audit(request, 'product.storage_delete', product, f"{product.title}: {label}")
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Categories ───────────────────────────────────────────

class AdminCategorySerializer(serializers.ModelSerializer):
    photo = serializers.ImageField(validators=[validate_image])

    class Meta:
        model = Category
        fields = ('title', 'photo')


@extend_schema(tags=['Admin'])
class AdminCategoryListCreateAPIView(AdminAPIView):
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(responses=CategorySerializer(many=True), summary="Kategoriyalar (admin)")
    def get(self, request):
        categories = Category.objects.annotate(products_count=Count('product'))
        data = []
        for category in categories:
            item = CategorySerializer(category, context={'request': request}).data
            item['products_count'] = category.products_count
            data.append(item)
        return Response(data)

    @extend_schema(request=AdminCategorySerializer, responses=CategorySerializer, summary="Kategoriya yaratish")
    def post(self, request):
        ser = AdminCategorySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        category = ser.save()
        audit(request, 'category.create', category, category.title)
        return Response(
            CategorySerializer(category, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=['Admin'])
class AdminCategoryDetailAPIView(AdminAPIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @extend_schema(request=AdminCategorySerializer, responses=CategorySerializer, summary="Kategoriya yangilash")
    def patch(self, request, pk):
        category = Category.objects.filter(pk=pk).first()
        if not category:
            return not_found('Kategoriya topilmadi')
        old_photo = category.photo.name if category.photo else ''
        ser = AdminCategorySerializer(category, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        category = ser.save()
        if old_photo and category.photo.name != old_photo:
            category.photo.storage.delete(old_photo)
        audit(request, 'category.update', category, category.title)
        return Response(CategorySerializer(category, context={'request': request}).data)

    @extend_schema(summary="Kategoriya o'chirish")
    def delete(self, request, pk):
        category = Category.objects.filter(pk=pk).first()
        if not category:
            return not_found('Kategoriya topilmadi')
        title, photo = category.title, category.photo
        try:
            with transaction.atomic():
                category.delete()
        except ProtectedError:
            return Response(
                {'error': "Bu kategoriyada mahsulotlar bor — avval ularni boshqa kategoriyaga o'tkazing."},
                status=status.HTTP_409_CONFLICT,
            )
        delete_file(photo)
        audit(request, 'category.delete', None, f"#{pk} {title}")
        return Response(status=status.HTTP_204_NO_CONTENT)
