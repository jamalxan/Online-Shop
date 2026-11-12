"""Kichik umumiy yordamchilar."""
from rest_framework.settings import api_settings


def client_ip(request) -> str:
    """
    Mijoz IP manzili. X-Forwarded-For faqat NUM_PROXIES sozlangan bo'lsa hisobga
    olinadi (DRF throttling bilan bir xil qoida) — aks holda mijoz sarlavhani
    soxtalashtirib limit va audit yozuvlarini chalg'itishi mumkin edi.
    """
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    remote = request.META.get('REMOTE_ADDR') or ''
    num_proxies = api_settings.NUM_PROXIES
    if not num_proxies or not xff:
        return remote
    addrs = [a.strip() for a in xff.split(',') if a.strip()]
    if not addrs:
        return remote
    return addrs[-min(num_proxies, len(addrs))]


def csv_safe(value) -> str:
    """CSV/Excel formula in'ektsiyasidan himoya: =, +, -, @ bilan boshlangan katakka ' qo'shiladi."""
    text = '' if value is None else str(value)
    if text and text[0] in ('=', '+', '-', '@', '\t', '\r'):
        return "'" + text
    return text
