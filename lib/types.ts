// ─── Django Backend API Types ─────────────────────────────
// Money values are decimal STRINGS in JSON — always parse with toNumber().

export interface ApiCategory {
    id: number
    title: string
    photo: string | null
    products_count?: number   // admin list only
    product_count?: number    // public list: active products
}

/** Filtr paneli uchun: shu doirada (kategoriya / qidiruv) mavjud variantlar. */
export interface CatalogFacets {
    count: number
    minPrice: number | null
    maxPrice: number | null
    storages: string[]
    colors: { name: string; hex: string }[]
}

export interface ApiProductPhoto {
    id: number
    photo: string
    order?: number
}

export interface ApiColorVariantPhoto {
    id: number
    photo: string
    order: number
}

export interface ApiColorVariant {
    id: number
    name: string
    hex_code: string
    photos: ApiColorVariantPhoto[]
    order: number
}

export interface ApiStorageOption {
    id: number
    label: string        // "512/8", "1T/16", "256"
    storage: string      // "512GB", "1TB", "256GB"
    ram: string | null   // "8GB", "16GB" or ""
    price: string        // base price (decimal string)
    final_price?: string // price after the product's discount (decimal string)
    order?: number
}

export interface ApiProduct {
    id: number
    title: string
    slug?: string
    price: string           // undiscounted base price (decimal string)
    final_price?: string    // server-computed price after discount (cheapest option if any)
    discount: number        // discount percent
    thumbnail_photo: string | null
    quantity: number
    description?: string
    category?: string | ApiCategory | null
    category_id?: number | null
    photos?: ApiProductPhoto[]
    color_variants?: ApiColorVariant[]
    storage_options?: ApiStorageOption[]
    created_at?: string
    updated_at?: string
    is_active?: boolean
}

export interface ApiCartStorageOption {
    id: number
    label: string
    storage: string
    ram: string | null
    price: string
    final_price: string
}

export interface ApiCartColorVariant {
    id: number
    name: string
    hex_code: string
}

export interface ApiCartItem {
    id: number
    product: ApiProduct
    quantity: number
    storage_option: ApiCartStorageOption | null
    color_variant: ApiCartColorVariant | null
    unit_price: string
    total: string
    added_at: string
}

export interface ApiCart {
    id: number
    items: ApiCartItem[]
    total_price: string
    items_count: number
    updated_at: string
}

export type OrderStatus = "pending" | "preparing" | "shipping" | "delivered" | "canceled"
export type DeliveryMethod = "standard" | "express" | "pickup"
/** "cash" — qabul qilganda; qolganlari onlayn usullar (hozircha faqat demo rejimda ishlaydi). */
export type PaymentMethod = "cash" | "apple_pay" | "google_pay" | "click" | "payme" | "xazna"

export interface ApiOrder {
    id: number
    checkout_id?: string
    product: ApiProduct
    quantity: number
    unit_price: string
    total_price: string
    /** Xarid paytidagi dollar kursi (0 yoki yo'q — eski buyurtma: joriy kurs olinadi). */
    usd_rate?: number
    storage_label?: string | null
    color_name?: string | null
    address?: string | null
    delivery_method?: DeliveryMethod | string | null
    comment?: string | null
    has_discount: boolean
    status: OrderStatus | string
    status_display: string
    created_at: string
    updated_at: string
    payment_method?: PaymentMethod | string
    payment_method_display?: string
    /** To'lov holati (shu checkout uchun: onlayn to'lov yoki kartaga o'tkazma cheki); to'lov yo'q bo'lsa null. */
    payment_status?: PaymentStatus | null
    /** To'lov demo rejimda "o'tgan": haqiqiy pul yechilmagan. */
    payment_demo?: boolean
    // Not guaranteed by the contract — rendered only when present.
    first_name?: string
    phone_number?: string
    user_email?: string
    user_id?: number | null
}

export type PaymentStatus = "review" | "complete" | "canceled"

export interface ApiPayment {
    id: number
    checkout_id: string | null
    card_number: string
    amount: string
    status: PaymentStatus
    status_display: string
    /** Onlayn to'lov tizimi; "" — kartaga o'tkazma (chek bilan). */
    provider?: string
    provider_display?: string
    /** Demo to'lov: haqiqiy pul tushmagan. */
    is_demo?: boolean
    note: string
    receipt_url: string | null
    created_at: string
    reviewed_at: string | null
}

export interface AdminPayment extends ApiPayment {
    user_email: string | null
    user_name: string
    reviewed_by_email: string | null
    orders: { id: number; title: string; quantity: number; total_price: string; usd_rate?: number; status: OrderStatus }[]
}

/** Do'kon aloqa ma'lumotlari — admin paneldan boshqariladi; bo'sh maydon ko'rsatilmaydi. */
export interface StoreInfo {
    store_name: string
    /** Narxlar kiritilgan valyuta: "USD" yoki "UZS". API'dagi barcha summalar shu valyutada. */
    currency: string
    /** 1 AQSh dollari necha so'm (0 — noma'lum: konvertatsiya qilinmaydi). */
    usd_rate: number
    /** Xaridor o'zi tanlamaguncha narxlar ko'rinadigan valyuta ("" — `currency` bilan bir xil). */
    display_currency: string
    phone: string
    phone_secondary: string
    email: string
    address: string
    working_hours: string
    telegram_url: string
    instagram_url: string
    delivery_note: string
    card_payment: { card_number: string; card_holder: string } | null
    /** Onlayn to'lov usullari demo rejimda yoqilgan (haqiqiy to'lov tizimi ulanmagan). */
    demo_payments?: boolean
}

export interface AdminStoreSettings extends Omit<StoreInfo, "card_payment" | "demo_payments"> {
    payment_card_number: string
    payment_card_holder: string
    updated_at: string
}

/** Sahifalangan admin javobi. */
export interface Paged<T> {
    count: number
    page: number
    page_size: number
    pages: number
    results: T[]
}

export interface ApiWishlist {
    id: number
    products: ApiProduct[]
}

export interface UserProfile {
    id: number
    first_name: string
    last_name: string
    email: string
    phone_number: string
    username: string
    is_staff?: boolean
}

export interface AdminPeriodTotals {
    revenue: string
    orders: number
    checkouts: number
    avg_check: string
    new_customers: number
}

export interface AdminCounters {
    pending_orders: number
    payments_review: number
    unread_messages: number
}

export interface AdminStats {
    days: number
    total_products: number
    total_orders: number
    total_users: number
    revenue: string
    period: AdminPeriodTotals
    previous: AdminPeriodTotals
    series: { date: string; revenue: string; orders: number }[]
    status_counts: Record<OrderStatus, number>
    top_products: { id: number; title: string; quantity: number; revenue: string }[]
    low_stock: { id: number; title: string; quantity: number; thumbnail_photo: string | null }[]
    low_stock_threshold: number
    counters: AdminCounters
    recent_orders: ApiOrder[]
}

export interface AdminCustomer {
    id: number
    first_name: string
    last_name: string
    email: string
    phone_number: string | null
    date_joined: string
    last_login: string | null
    is_active: boolean
    orders_count: number
    total_spent: string
}

export interface AdminCustomerDetail extends AdminCustomer {
    orders: ApiOrder[]
}

export interface AdminMessage {
    id: number
    name: string
    email: string
    phone: string
    subject: string
    message: string
    is_read: boolean
    created_at: string
}

export interface AdminSubscriber {
    id: number
    email: string
    is_active: boolean
    created_at: string
}

export interface AdminAuditEntry {
    id: number
    actor_email: string
    action: string
    object_type: string
    object_id: string
    summary: string
    ip: string | null
    created_at: string
}

/** Rasm + serverdagi id (admin panelda o'chirish uchun). */
export interface PhotoRef {
    id: number
    url: string
}

// ─── Frontend Types (after transform) ────────────────────

export interface ColorVariant {
    id: number
    name: string
    hex: string
    images: string[]
    photos?: PhotoRef[]    // same pictures with ids (admin)
}

export interface StorageOption {
    id: number
    label: string          // "512/8"
    storage: string        // "512GB"
    ram: string            // "8GB" or ""
    price: number          // price charged (after discount)
    originalPrice?: number // undiscounted price, only when higher than price
}

export interface Product {
    id: string
    name: string
    category: string
    categoryId?: number
    price: number           // price charged (server-computed final price)
    basePrice: number       // undiscounted base price as stored on the product
    originalPrice?: number  // struck-through price, only when discounted
    image: string           // thumbnail
    badge?: string
    isNew?: boolean
    discount: number
    quantity: number        // stock
    description?: string
    photos?: string[]            // all product photos (fallback)
    gallery?: PhotoRef[]         // same pictures with ids (admin)
    colorVariants?: ColorVariant[]
    storageOptions?: StorageOption[]
    createdAt?: string
    isActive?: boolean
}

export interface Category {
    id: number
    name: string
    image: string
    href: string
    slug: string
    productsCount?: number
}
