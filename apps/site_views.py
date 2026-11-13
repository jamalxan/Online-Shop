"""Do'kon ma'lumotlari, yangiliklarga obuna va murojaat formasi (ochiq endpointlar)."""
import logging

from django.conf import settings
from django.core.cache import cache
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.models import ContactMessage, NewsletterSubscriber, StoreSettings, STORE_SETTINGS_CACHE_KEY
from apps.serializers import ContactMessageCreateSerializer, NewsletterSerializer, StoreInfoSerializer

logger = logging.getLogger(__name__)

STORE_INFO_TTL = 5 * 60


@extend_schema(tags=['Store'])
class StoreInfoAPIView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(responses=StoreInfoSerializer, summary="Do'kon aloqa ma'lumotlari")
    def get(self, request):
        data = cache.get(STORE_SETTINGS_CACHE_KEY)
        if data is None:
            data = StoreInfoSerializer(StoreSettings.load()).data
            cache.set(STORE_SETTINGS_CACHE_KEY, data, STORE_INFO_TTL)
        # server sozlamasi — keshlangan nusxaga emas, har javobga qo'shiladi
        response = Response({**data, 'demo_payments': settings.DEMO_PAYMENTS})
        response['Cache-Control'] = 'public, max-age=60'
        return response


@extend_schema(tags=['Store'])
class NewsletterSubscribeAPIView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_scope = 'newsletter'

    @extend_schema(request=NewsletterSerializer, responses={200: None}, summary="Yangiliklarga obuna bo'lish")
    def post(self, request):
        serializer = NewsletterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subscriber, created = NewsletterSubscriber.objects.get_or_create(email=serializer.validated_data['email'])
        if not created and not subscriber.is_active:
            subscriber.is_active = True
            subscriber.save(update_fields=['is_active'])
        # Javob har doim bir xil: email avval obuna bo'lgan-bo'lmagani oshkor qilinmaydi
        return Response({'message': "Obuna rasmiylashtirildi"})


@extend_schema(tags=['Store'])
class ContactMessageAPIView(APIView):
    permission_classes = (AllowAny,)
    throttle_scope = 'contact'

    @extend_schema(request=ContactMessageCreateSerializer, responses={201: None}, summary="Murojaat yuborish")
    def post(self, request):
        serializer = ContactMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if data.pop('website', ''):
            # Bot: muvaffaqiyatli ko'rinadigan javob, lekin hech narsa saqlanmaydi
            return Response({'message': "Xabaringiz qabul qilindi"}, status=status.HTTP_201_CREATED)
        user = request.user if request.user.is_authenticated else None
        message = ContactMessage.objects.create(user=user, **data)
        logger.info("Yangi murojaat: id=%s", message.pk)
        return Response({'message': "Xabaringiz qabul qilindi"}, status=status.HTTP_201_CREATED)
