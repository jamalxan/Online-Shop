import { toNumber } from './utils'
import type { CatalogSort } from './catalog'
import type {
  AdminAuditEntry,
  AdminCounters,
  AdminCustomer,
  AdminCustomerDetail,
  AdminMessage,
  AdminPayment,
  AdminStats,
  AdminStoreSettings,
  AdminSubscriber,
  ApiCart,
  ApiCategory,
  ApiColorVariant,
  ApiOrder,
  ApiPayment,
  ApiProduct,
  ApiStorageOption,
  ApiWishlist,
  CatalogFacets,
  Category,
  ColorVariant,
  DeliveryMethod,
  OrderStatus,
  Paged,
  Product,
  StorageOption,
  StoreInfo,
  UserProfile,
} from './types'

export type { ApiCart, ApiCartItem, ApiOrder, ApiWishlist, UserProfile } from './types'

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const MEDIA_URL = `${API_BASE_URL}/media/`

const NETWORK_ERROR = "Server bilan aloqa yo'q"
const GENERIC_ERROR = 'Xatolik yuz berdi'
/** Server-side (build / ISR) fetches must never hang the render. */
const SERVER_FETCH_TIMEOUT_MS = 8000

// ─── Session ──────────────────────────────────────────────
// The refresh token lives in an httpOnly cookie: the backend sets it, the browser sends it
// only to /api/auth/*, and JavaScript can never read it. The access token (15 minutes) is
// kept in memory only. Nothing that can sign a request is written to localStorage, so a
// script injected into the page cannot walk away with a long-lived credential.
// A page load therefore starts without an access token and asks for one (restoreSession).

/**
 * Not a credential. It only says "this browser probably has a session cookie", so anonymous
 * visitors do not fire a refresh request on every page load. Its value changes on every
 * login, which is how other tabs notice that the account changed.
 */
const SESSION_HINT_KEY = 'session_hint'
/** Tokens used to be stored under these keys; anything still there is removed. */
const LEGACY_TOKEN_KEYS = ['access_token', 'refresh_token']
/** Fired on window when the session ends because the refresh token was rejected. */
export const AUTH_LOGOUT_EVENT = 'auth:logout'
/** Fired on window when another tab signed in: this tab must reload the user and the cart. */
export const AUTH_SYNC_EVENT = 'auth:sync'

let accessToken: string | null = null
let restorePromise: Promise<boolean> | null = null
let pendingLogout: Promise<unknown> = Promise.resolve()

/** The in-memory access token; null until restoreSession() or a login has completed. */
export function getToken(): string | null {
  return accessToken
}

function hasSessionHint(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) !== null
  } catch {
    return false
  }
}

function setSession(access: string) {
  if (typeof window === 'undefined') return
  accessToken = access
  restorePromise = null
  try {
    window.localStorage.setItem(SESSION_HINT_KEY, `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  } catch {
    // storage unavailable (private mode / blocked): the session works until the tab is reloaded
  }
}

/** Forgets the session in this tab. The cookie itself is only removed by logout(). */
export function clearTokens() {
  accessToken = null
  restorePromise = null
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SESSION_HINT_KEY)
    for (const key of LEGACY_TOKEN_KEYS) window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  try {
    for (const key of LEGACY_TOKEN_KEYS) window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
  // Logout or login in another tab: the cookie is shared, so this tab's token is stale.
  window.addEventListener('storage', (event) => {
    if (event.key !== SESSION_HINT_KEY) return
    accessToken = null
    restorePromise = null
    window.dispatchEvent(new Event(event.newValue ? AUTH_SYNC_EVENT : AUTH_LOGOUT_EVENT))
  })
  if (process.env.NODE_ENV !== 'production') {
    try {
      const apiHost = new URL(API_BASE_URL).hostname
      const loopback = ['localhost', '127.0.0.1']
      if (apiHost !== window.location.hostname && loopback.includes(apiHost) && loopback.includes(window.location.hostname)) {
        console.warn(
          `[auth] Sahifa "${window.location.hostname}" da, API esa "${apiHost}" da ochilgan. Brauzer uchun bular ` +
          "boshqa-boshqa sayt: sessiya cookie'si yuborilmaydi va sahifa yangilanganda hisobdan chiqib ketasiz. " +
          'Ikkalasini ham bir xil nom bilan oching (masalan, localhost).',
        )
      }
    } catch {
      // unparsable NEXT_PUBLIC_API_URL: fetch itself will report it
    }
  }
}

// ─── Error helpers ────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Parol',
  old_password: 'Eski parol',
  new_password: 'Yangi parol',
  confirm_password: 'Parolni tasdiqlash',
  username: 'Username',
  first_name: 'Ism',
  last_name: 'Familiya',
  phone_number: 'Telefon',
  code: 'Kod',
  title: 'Nomi',
  price: 'Narx',
  discount: 'Chegirma',
  quantity: 'Miqdor',
  category: 'Kategoriya',
  photo: 'Rasm',
  photos: 'Rasmlar',
  thumbnail_photo: 'Asosiy rasm',
  address: 'Manzil',
  status: 'Status',
  label: 'Label',
  storage: 'Xotira',
  name: 'Nomi',
  hex_code: 'Rang kodi',
}

function firstMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim()
    // never surface HTML error pages or huge blobs to users
    if (!text || text.length > 300 || text.startsWith('<')) return null
    return text
  }
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const msg = firstMessage(item)
      if (msg) return msg
    }
    return null
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['error', 'detail', 'message', 'non_field_errors']) {
      const msg = firstMessage(record[key])
      if (msg) return msg
    }
    for (const [key, fieldValue] of Object.entries(record)) {
      const msg = firstMessage(fieldValue)
      if (msg) return FIELD_LABELS[key] ? `${FIELD_LABELS[key]}: ${msg}` : msg
    }
  }
  return null
}

/**
 * Turns a DRF error body into one readable line.
 * Handles {error}, {detail}, {non_field_errors: [..]}, {field: [..]}, plain strings and arrays.
 */
export function extractError(data: unknown, fallback: string = GENERIC_ERROR): string {
  return firstMessage(data) ?? fallback
}

function errorForStatus(status: number, data: unknown, fallback?: string, authed = true): string {
  if (status === 429) {
    const detail = firstMessage(data) ?? ''
    const seconds = /(\d+)\s*(second|soniya)/i.exec(detail)?.[1]
    return seconds
      ? `Juda ko'p urinish. ${seconds} soniyadan so'ng qayta urinib ko'ring.`
      : "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring."
  }
  // Authenticated calls get fixed texts (DRF's own 401/403 bodies are English boilerplate);
  // public auth endpoints carry a meaningful server message.
  if (status === 401 && authed) return 'Sessiya tugagan. Qaytadan kiring.'
  if (status === 403 && authed) return "Bu amal uchun ruxsat yo'q"
  if (status >= 500) return extractError(data, "Serverda xatolik yuz berdi. Keyinroq urinib ko'ring.")
  return extractError(data, fallback ?? GENERIC_ERROR)
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null
  let text: string
  try {
    text = await res.text()
  } catch {
    return null
  }
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null // non-JSON body (HTML error page, plain text)
  }
}

// ─── Central fetch wrapper ────────────────────────────────

type RefreshOutcome = 'ok' | 'rejected' | 'unreachable'

let refreshPromise: Promise<RefreshOutcome> | null = null

async function requestRefresh(): Promise<RefreshOutcome> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh/`, { method: 'POST', credentials: 'include' })
    if (res.ok) {
      const data = (await parseBody(res)) as { access?: unknown } | null
      if (!data || typeof data.access !== 'string') return 'rejected'
      accessToken = data.access
      return 'ok'
    }
    // 401/403 = the cookie is missing, expired or revoked. Anything else (429, 5xx) says
    // nothing about the session, so it must not log the user out.
    return res.status === 401 || res.status === 403 ? 'rejected' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

async function doRefresh(): Promise<RefreshOutcome> {
  // Every refresh rotates the cookie and revokes the previous token. Two tabs refreshing at
  // the same moment would send the same token and the slower one would be rejected, so the
  // tabs take turns through a cross-tab lock.
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks) return locks.request('auth-refresh', requestRefresh)
  // No Web Locks (Safari before 15.4, old Firefox): a rejection may only mean that another tab
  // won the race and the cookie already holds its new token. Retry a few times, each after a
  // random pause, so tabs that collided once do not collide again on the retry.
  let outcome = await requestRefresh()
  for (let attempt = 0; attempt < 3 && outcome === 'rejected'; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 600))
    outcome = await requestRefresh()
  }
  return outcome
}

/** Single-flight: concurrent 401s (and React's double-invoked effects) share one refresh request. */
function refreshAccessToken(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/**
 * Gets an access token for a browser that still has its session cookie (page load, new tab).
 * Resolves to whether the visitor is signed in. Safe to call from anywhere, any number of times.
 */
export function restoreSession(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (accessToken) return Promise.resolve(true)
  if (!restorePromise) {
    restorePromise = hasSessionHint()
      ? refreshAccessToken().then((outcome) => {
          if (outcome === 'rejected') clearTokens()
          return outcome === 'ok'
        })
      : Promise.resolve(false)
  }
  return restorePromise
}

function withAuth(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

/**
 * fetch() against the API with the Bearer token attached.
 * On 401 it refreshes the access token once (shared between concurrent calls) and retries;
 * if the session is gone the local state is cleared and the original 401 is returned.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE_URL}${path}`
  // a component can call the API before the app has finished restoring the session
  if (!accessToken) await restoreSession()
  const token = accessToken
  const res = await fetch(url, withAuth(init, token))
  if (res.status !== 401 || !token) return res

  // Another call may already have refreshed while this request was in flight.
  if (!accessToken || accessToken === token) {
    const outcome = await refreshAccessToken()
    if (outcome === 'unreachable') return res
    if (outcome === 'rejected') {
      clearTokens()
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT))
      return res
    }
  }
  return fetch(url, withAuth(init, accessToken))
}

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number; data?: undefined }

interface RequestOptions {
  method?: string
  /** Plain objects are sent as JSON, FormData as multipart. */
  body?: unknown
  /** false → never attach a token / never attempt a refresh (login, register, OTP). */
  auth?: boolean
  /** true → the response may set the session cookie (cross-origin fetch drops Set-Cookie otherwise). */
  session?: boolean
  fallbackError?: string
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, auth = true, session = false, fallbackError } = options
  const init: RequestInit = { method }
  if (session) init.credentials = 'include'
  if (body instanceof FormData) {
    init.body = body // the browser sets the multipart boundary
  } else if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  let res: Response
  try {
    res = auth ? await apiFetch(path, init) : await fetch(`${API_BASE_URL}${path}`, init)
  } catch {
    return { ok: false, error: NETWORK_ERROR, status: 0 }
  }
  const data = await parseBody(res)
  if (!res.ok) return { ok: false, error: errorForStatus(res.status, data, fallbackError, auth), status: res.status }
  return { ok: true, data: data as T, status: res.status }
}

/** Public, cacheable GET used by server components. Throws on network failure. */
async function publicGet(path: string, revalidate = 60): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    next: { revalidate },
    signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
  })
}

// ─── URL helpers ──────────────────────────────────────────

export function getImageUrl(path: string | null | undefined): string {
  if (!path) return '/placeholder.jpg'
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/')) return `${API_BASE_URL}${path}`
  return `${MEDIA_URL}${path}`
}

/** Only same-site paths are accepted as post-login redirect targets. */
export function safeRedirectPath(target: string | null | undefined, fallback = '/account'): string {
  if (!target) return fallback
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return fallback
  return target
}

// ─── Slug helpers ─────────────────────────────────────────
const SLUG_MAP: Record<string, string> = {
  macs: 'macbook', macbook: 'macbook',
  iphones: 'iphone', iphone: 'iphone',
  airpods: 'airpods',
  watches: 'watch', watch: 'watch',
  accessories: 'accessories',
  ipad: 'ipad', ipads: 'ipad',
}

export function categorySlug(title: string, id?: number): string {
  const lower = title.trim().toLowerCase()
  if (SLUG_MAP[lower]) return SLUG_MAP[lower]
  const slug = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || (id !== undefined ? `c-${id}` : 'category')
}

// ─── Transform functions ──────────────────────────────────

export function transformColorVariant(v: ApiColorVariant): ColorVariant {
  return {
    id: v.id,
    name: v.name,
    hex: v.hex_code,
    images: (v.photos ?? []).map((p) => getImageUrl(p.photo)),
    photos: (v.photos ?? []).map((p) => ({ id: p.id, url: getImageUrl(p.photo) })),
  }
}

export function transformStorageOption(s: ApiStorageOption): StorageOption {
  const base = toNumber(s.price)
  const price = toNumber(s.final_price ?? s.price)
  return {
    id: s.id,
    label: s.label,
    storage: s.storage,
    ram: s.ram || '',
    price,
    originalPrice: base > price ? base : undefined,
  }
}

/** Prices come from the server (`final_price`); nothing is discounted client-side. */
export function transformProduct(p: ApiProduct): Product {
  const basePrice = toNumber(p.price)
  const price = toNumber(p.final_price ?? p.price)
  const storageOptions = (p.storage_options ?? []).map(transformStorageOption)
  const colorVariants = (p.color_variants ?? []).map(transformColorVariant)

  // Struck-through price: the undiscounted price of whatever `price` refers to.
  const cheapest = storageOptions.length
    ? storageOptions.reduce((min, s) => (s.price < min.price ? s : min))
    : null
  const original = cheapest ? cheapest.originalPrice : basePrice
  const category = p.category

  return {
    id: String(p.id),
    name: p.title,
    category: category && typeof category === 'object' ? category.title : category ?? '',
    categoryId: category && typeof category === 'object' ? category.id : p.category_id ?? undefined,
    price,
    basePrice,
    originalPrice: original !== undefined && original > price ? original : undefined,
    image: getImageUrl(p.thumbnail_photo),
    discount: p.discount ?? 0,
    quantity: p.quantity ?? 0,
    description: p.description,
    photos: p.photos?.map((ph) => getImageUrl(ph.photo)) ?? [],
    gallery: p.photos?.map((ph) => ({ id: ph.id, url: getImageUrl(ph.photo) })) ?? [],
    colorVariants,
    storageOptions,
    isActive: p.is_active,
    createdAt: p.created_at,
    isNew: false,
  }
}

export function transformCategory(c: ApiCategory): Category {
  const slug = categorySlug(c.title, c.id)
  return {
    id: c.id,
    name: c.title,
    image: getImageUrl(c.photo),
    href: `/category/${slug}`,
    slug,
    productsCount: c.products_count ?? c.product_count,
  }
}

// ─── Auth API ─────────────────────────────────────────────

type ActionResult = { ok: true; error?: undefined } | { ok: false; error: string }

function toAction(result: ApiResult<unknown>): ActionResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function sendVerifyEmail(email: string): Promise<ActionResult> {
  return toAction(await request('/api/auth/verify-email/', { method: 'POST', body: { email }, auth: false }))
}

export async function verifyOtp(email: string, code: string): Promise<ActionResult> {
  return toAction(await request('/api/auth/verify-otp/', {
    method: 'POST', body: { email, code }, auth: false, fallbackError: "Kod noto'g'ri",
  }))
}

export async function register(payload: {
  first_name: string; last_name: string; username: string
  email: string; phone_number: string; password: string
}): Promise<ActionResult> {
  return toAction(await request('/api/auth/register/', {
    method: 'POST', body: payload, auth: false, fallbackError: "Ro'yxatdan o'tishda xatolik",
  }))
}

export async function login(
  email: string, password: string
): Promise<{ ok: true; error?: undefined } | { ok: false; error: string; adminOnly?: boolean }> {
  await pendingLogout // a late logout response must not wipe the cookie this login is about to set
  const res = await request<{ access?: string }>('/api/token/', {
    method: 'POST', body: { email, password }, auth: false, session: true, fallbackError: 'Email yoki parol xato',
  })
  if (!res.ok) {
    // 403 = staff account: those may only sign in through /admin/login
    if (res.status === 403) return { ok: false, error: res.error, adminOnly: true }
    if (res.status === 400 || res.status === 401) return { ok: false, error: 'Email yoki parol xato' }
    return { ok: false, error: res.error }
  }
  if (!res.data?.access) return { ok: false, error: GENERIC_ERROR }
  setSession(res.data.access)
  return { ok: true }
}

// ─── Admin two-step login ─────────────────────────────────

export async function adminLoginStart(
  email: string, password: string
): Promise<ApiResult<{ challenge: string; email: string }>> {
  const res = await request<{ challenge?: string; email?: string }>('/api/admin/auth/login/', {
    method: 'POST', body: { email, password }, auth: false, fallbackError: 'Email yoki parol xato',
  })
  if (!res.ok) return res
  if (!res.data?.challenge) return { ok: false, error: GENERIC_ERROR, status: res.status }
  return { ok: true, data: { challenge: res.data.challenge, email: res.data.email ?? email }, status: res.status }
}

export async function adminLoginVerify(challenge: string, code: string): Promise<ApiResult<null>> {
  await pendingLogout
  const res = await request<{ access?: string }>('/api/admin/auth/verify/', {
    method: 'POST', body: { challenge, code }, auth: false, session: true,
    fallbackError: "Kod noto'g'ri yoki muddati o'tgan",
  })
  if (!res.ok) return res
  if (!res.data?.access) return { ok: false, error: GENERIC_ERROR, status: res.status }
  setSession(res.data.access)
  return { ok: true, data: null, status: res.status }
}

export async function adminLoginResend(challenge: string): Promise<ApiResult<null>> {
  const res = await request('/api/admin/auth/resend/', { method: 'POST', body: { challenge }, auth: false })
  return res.ok ? { ok: true, data: null, status: res.status } : res
}

/**
 * Ends the session in this tab AND on the server: the refresh token is revoked and its cookie
 * removed, so a copy that leaked earlier stops working (it would otherwise live for 7 days).
 */
export function logout() {
  const hadSession = Boolean(accessToken) || hasSessionHint()
  clearTokens()
  if (!hadSession) return
  // fire-and-forget: the UI must not wait for (or fail on) the network
  pendingLogout = fetch(`${API_BASE_URL}/api/auth/logout/`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
  }).catch(() => undefined)
}

export async function forgotPassword(email: string): Promise<ActionResult> {
  return toAction(await request('/api/auth/forgot-password/', { method: 'POST', body: { email }, auth: false }))
}

export async function forgotPasswordVerify(email: string, code: string): Promise<ActionResult> {
  return toAction(await request('/api/auth/forgot-password-verify/', {
    method: 'POST', body: { email, code }, auth: false, fallbackError: "Kod noto'g'ri",
  }))
}

export async function resetPassword(
  email: string, new_password: string, confirm_password: string
): Promise<ActionResult> {
  return toAction(await request('/api/auth/reset-password/', {
    method: 'POST', body: { email, new_password, confirm_password }, auth: false,
  }))
}

export async function firebasePhoneLogin(
  firebase_token: string, phone_number: string
): Promise<{ ok: boolean; error?: string; created?: boolean }> {
  await pendingLogout
  const res = await request<{ access?: string; created?: boolean }>(
    '/api/auth/firebase-login/',
    { method: 'POST', body: { firebase_token, phone_number }, auth: false, session: true },
  )
  if (!res.ok) return { ok: false, error: res.error }
  if (!res.data?.access) return { ok: false, error: GENERIC_ERROR }
  setSession(res.data.access)
  return { ok: true, created: res.data.created }
}

// ─── Profile API ──────────────────────────────────────────

export async function getProfile(): Promise<UserProfile | null> {
  if (!(await restoreSession())) return null
  const res = await request<UserProfile>('/api/profile/')
  return res.ok ? res.data : null
}

/** `email`, `phone_number` and `is_staff` are read-only on the backend and never sent. */
export async function updateProfile(
  data: Partial<Pick<UserProfile, 'first_name' | 'last_name' | 'username'>>
): Promise<ActionResult> {
  const { first_name, last_name, username } = data
  return toAction(await request('/api/profile/', { method: 'PATCH', body: { first_name, last_name, username } }))
}

export async function changePassword(
  old_password: string, new_password: string, confirm_password: string
): Promise<ActionResult> {
  const res = await request<{ access?: string }>('/api/profile/change-password/', {
    method: 'POST', body: { old_password, new_password, confirm_password }, session: true,
  })
  if (!res.ok) return { ok: false, error: res.error }
  // every older refresh token is revoked by the backend — this device gets a fresh session
  if (res.data?.access) setSession(res.data.access)
  return { ok: true }
}

// ─── Cart API ─────────────────────────────────────────────

export interface CartLinePayload {
  product_id: number
  quantity?: number
  storage_option_id?: number
  color_variant_id?: number
}

type CartResult = { ok: true; cart: ApiCart | null; error?: undefined } | { ok: false; error: string; cart?: undefined }

function isCart(data: unknown): data is ApiCart {
  return !!data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
}

function toCartResult(res: ApiResult<unknown>): CartResult {
  if (!res.ok) return { ok: false, error: res.error }
  // some endpoints answer with a message instead of the cart → caller refetches
  return { ok: true, cart: isCart(res.data) ? res.data : null }
}

export async function getCart(): Promise<ApiCart | null> {
  if (!getToken()) return null
  const res = await request<ApiCart>('/api/cart/')
  return res.ok && isCart(res.data) ? res.data : null
}

export async function addToCart(line: CartLinePayload): Promise<CartResult> {
  const body: CartLinePayload = { product_id: line.product_id, quantity: line.quantity ?? 1 }
  if (line.storage_option_id) body.storage_option_id = line.storage_option_id
  if (line.color_variant_id) body.color_variant_id = line.color_variant_id
  return toCartResult(await request('/api/cart/', { method: 'POST', body }))
}

export async function updateCartItem(itemId: number, quantity: number): Promise<CartResult> {
  return toCartResult(await request(`/api/cart/${itemId}/`, { method: 'PATCH', body: { quantity } }))
}

export async function removeCartItem(itemId: number): Promise<CartResult> {
  return toCartResult(await request(`/api/cart/${itemId}/`, { method: 'DELETE' }))
}

export async function clearCart(): Promise<ActionResult> {
  return toAction(await request('/api/cart/', { method: 'DELETE' }))
}

// ─── Products API (public, cached) ────────────────────────

async function fetchCategoriesRaw(): Promise<ApiCategory[]> {
  const res = await publicGet('/api/categories/')
  if (!res.ok) throw new Error(`categories ${res.status}`)
  return (await res.json()) as ApiCategory[]
}

export async function getCategories(): Promise<Category[]> {
  try {
    return (await fetchCategoriesRaw()).map(transformCategory)
  } catch { return [] }
}

export interface CatalogQuery {
  q?: string
  category?: number
  /** leave this product out (related products) */
  exclude?: number
  sort?: CatalogSort
  inStock?: boolean
  priceRanges?: string[]
  storages?: string[]
  colors?: string[]
  page?: number
  pageSize?: number
}

function catalogQueryString(query: CatalogQuery): string {
  const search = new URLSearchParams()
  if (query.q) search.set('q', query.q)
  if (query.category) search.set('category', String(query.category))
  if (query.exclude) search.set('exclude', String(query.exclude))
  if (query.sort && query.sort !== 'new') search.set('ordering', query.sort)
  if (query.inStock) search.set('in_stock', 'true')
  if (query.priceRanges?.length) search.set('price', query.priceRanges.join(','))
  for (const storage of query.storages ?? []) search.append('storage', storage)
  for (const color of query.colors ?? []) search.append('color', color)
  if (query.page && query.page > 1) search.set('page', String(query.page))
  if (query.pageSize) search.set('page_size', String(query.pageSize))
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const EMPTY_PRODUCT_PAGE: Paged<Product> = { count: 0, page: 1, page_size: 0, pages: 1, results: [] }
export const EMPTY_FACETS: CatalogFacets = { count: 0, minPrice: null, maxPrice: null, storages: [], colors: [] }

/**
 * One page of active products, filtered and sorted by the API (never the whole catalog).
 * Throws when the API is unreachable, so a listing shows the error boundary instead of a false "no products".
 */
export async function getProductPage(query: CatalogQuery = {}): Promise<Paged<Product>> {
  const res = await publicGet(`/api/products/${catalogQueryString(query)}`)
  if (!res.ok) throw new Error(`products ${res.status}`)
  const data = (await res.json()) as Paged<ApiProduct>
  return { ...data, results: (data.results ?? []).map(transformProduct) }
}

/** Same, for places where a missing block is better than an error page (home sections, related products). */
export async function getProductPageSafe(query: CatalogQuery = {}): Promise<Paged<Product>> {
  try {
    return await getProductPage(query)
  } catch {
    return EMPTY_PRODUCT_PAGE
  }
}

/** Filter options (storages, colours, price bounds) and the total for a category / search. Never throws. */
export async function getProductFacets(scope: Pick<CatalogQuery, 'q' | 'category'> = {}): Promise<CatalogFacets> {
  try {
    const res = await publicGet(`/api/products/facets/${catalogQueryString(scope)}`)
    if (!res.ok) return EMPTY_FACETS
    const data = (await res.json()) as {
      count?: number; min_price?: number | null; max_price?: number | null
      storages?: string[]; colors?: { name: string; hex_code: string }[]
    }
    return {
      count: data.count ?? 0,
      minPrice: data.min_price ?? null,
      maxPrice: data.max_price ?? null,
      storages: data.storages ?? [],
      colors: (data.colors ?? []).map((c) => ({ name: c.name, hex: c.hex_code })),
    }
  } catch {
    return EMPTY_FACETS
  }
}

/**
 * Product detail. Returns null only when the product does not exist (404);
 * throws when the API is unreachable so the error boundary is shown instead of a false "not found".
 */
export async function getProductById(id: string): Promise<Product | null> {
  if (!/^\d+$/.test(id)) return null
  const res = await publicGet(`/api/products/${id}/`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`product ${res.status}`)
  return transformProduct((await res.json()) as ApiProduct)
}

/** Category by URL slug; null when no such category exists. Throws when the API is unreachable. */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  let wanted = slug
  try { wanted = decodeURIComponent(slug) } catch { /* keep raw */ }
  wanted = wanted.toLowerCase()

  const categories = await fetchCategoriesRaw()
  const raw = categories.find((c) => categorySlug(c.title, c.id) === wanted || c.title.toLowerCase() === wanted)
  return raw ? transformCategory(raw) : null
}

/** Other products from the same category, excluding the current one. */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  if (product.categoryId === undefined) return []
  const page = await getProductPageSafe({ category: product.categoryId, exclude: Number(product.id), pageSize: limit })
  return page.results
}

export async function searchProducts(query: string, signal?: AbortSignal): Promise<Product[]> {
  if (!query.trim()) return []
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/products/search/?title=${encodeURIComponent(query)}`,
      { cache: 'no-store', signal: signal ?? AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS) }
    )
    if (!res.ok) return []
    const data = (await res.json()) as ApiProduct[]
    return data.map(transformProduct)
  } catch { return [] }
}

// ─── Wishlist API ─────────────────────────────────────────

export async function getWishlist(): Promise<ApiWishlist | null> {
  if (!getToken()) return null
  const res = await request<ApiWishlist>('/api/wishlist/')
  return res.ok && res.data && Array.isArray(res.data.products) ? res.data : null
}

export async function addToWishlistApi(product_id: number): Promise<ActionResult> {
  return toAction(await request('/api/wishlist/', { method: 'POST', body: { product_id } }))
}

export async function removeFromWishlistApi(product_id: number): Promise<ActionResult> {
  return toAction(await request(`/api/wishlist/?product_id=${encodeURIComponent(product_id)}`, { method: 'DELETE' }))
}

// ─── Orders API ───────────────────────────────────────────

export interface CreateOrderPayload {
  first_name: string
  phone_number: string
  address?: string
  delivery_method?: DeliveryMethod
  comment?: string
  from_cart?: boolean
  product_id?: number
  quantity?: number
  storage_option_id?: number
  color_variant_id?: number
}

export async function createOrder(payload: CreateOrderPayload): Promise<ApiResult<ApiOrder[]>> {
  const res = await request<ApiOrder[] | ApiOrder>('/api/orders/', {
    method: 'POST', body: payload, fallbackError: 'Buyurtma yaratishda xatolik',
  })
  if (!res.ok) return res
  const orders = Array.isArray(res.data) ? res.data : res.data ? [res.data] : []
  return { ok: true, data: orders, status: res.status }
}

export async function getMyOrders(): Promise<ApiResult<ApiOrder[]>> {
  const res = await request<ApiOrder[]>('/api/orders/')
  if (!res.ok) return res
  return { ok: true, data: Array.isArray(res.data) ? res.data : [], status: res.status }
}

/** Customer cancels their own order (only while it is still pending; otherwise 409). */
export async function cancelOrder(id: number): Promise<ApiResult<ApiOrder | null>> {
  return request<ApiOrder | null>(`/api/orders/${id}/cancel/`, {
    method: 'POST', fallbackError: "Buyurtmani bekor qilib bo'lmadi",
  })
}

// ─── Payments (card transfer + receipt) ───────────────────

export async function getMyPayments(): Promise<ApiResult<ApiPayment[]>> {
  const res = await request<ApiPayment[]>('/api/payments/')
  if (!res.ok) return res
  return { ok: true, data: Array.isArray(res.data) ? res.data : [], status: res.status }
}

/** The amount is computed by the server from the orders of that checkout — never sent from here. */
export async function submitPaymentReceipt(checkoutId: string, receipt: File): Promise<ApiResult<ApiPayment>> {
  const fd = new FormData()
  fd.append('checkout_id', checkoutId)
  fd.append('check_photo', receipt)
  return request<ApiPayment>('/api/payments/', { method: 'POST', body: fd, fallbackError: "Chekni yuborib bo'lmadi" })
}

/**
 * Receipts are private files: they need the Bearer token, so they cannot be used as a plain
 * <img src>. Returns an object URL — the caller must URL.revokeObjectURL() it when done.
 */
export async function fetchPrivateImage(url: string): Promise<string | null> {
  if (!url.startsWith(`${API_BASE_URL}/`)) return null // never send the token to another origin
  try {
    const res = await apiFetch(url.slice(API_BASE_URL.length))
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

// ─── Store info, newsletter, contact (public) ─────────────

export const EMPTY_STORE_INFO: StoreInfo = {
  store_name: 'APEX Store', currency: 'USD', phone: '', phone_secondary: '', email: '', address: '', working_hours: '',
  telegram_url: '', instagram_url: '', delivery_note: '', card_payment: null,
}

/** Server components: cached for 60s; a backend outage degrades to "no contact details", not an error page. */
export async function getStoreInfo(): Promise<StoreInfo> {
  try {
    const res = await publicGet('/api/store/')
    if (!res.ok) return EMPTY_STORE_INFO
    const data = (await res.json()) as Partial<StoreInfo>
    return { ...EMPTY_STORE_INFO, ...data }
  } catch {
    return EMPTY_STORE_INFO
  }
}

/**
 * Browser-side, always fresh (bypasses the 60s page cache and the HTTP cache). Used where a stale
 * value costs money: the card a customer is told to transfer to must be the current one.
 */
export async function fetchStoreInfoFresh(): Promise<StoreInfo | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/store/`, { cache: 'no-store' })
    if (!res.ok) return null
    return { ...EMPTY_STORE_INFO, ...((await res.json()) as Partial<StoreInfo>) }
  } catch {
    return null
  }
}

export async function subscribeNewsletter(email: string): Promise<ActionResult> {
  return toAction(await request('/api/newsletter/', {
    method: 'POST', body: { email }, auth: false, fallbackError: "Obuna bo'lib bo'lmadi",
  }))
}

export interface ContactPayload {
  name: string
  email?: string
  phone?: string
  subject?: string
  message: string
  /** honeypot — always empty for real visitors */
  website?: string
}

export async function sendContactMessage(payload: ContactPayload): Promise<ActionResult> {
  return toAction(await request('/api/contact/', {
    method: 'POST', body: payload, auth: false, fallbackError: "Xabarni yuborib bo'lmadi",
  }))
}

// ─── Admin API (staff only — enforced by the backend) ─────

async function adminList<T>(path: string): Promise<ApiResult<T[]>> {
  const res = await request<T[]>(path)
  if (!res.ok) return res
  return { ok: true, data: Array.isArray(res.data) ? res.data : [], status: res.status }
}

type QueryValue = string | number | boolean | null | undefined

/** Builds "?a=1&b=x", skipping empty values. */
function query(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params as Record<string, QueryValue>)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

async function adminPaged<T, E = unknown>(
  path: string, params: object,
): Promise<ApiResult<Paged<T> & E>> {
  const res = await request<Paged<T> & E>(`${path}${query(params)}`)
  if (!res.ok) return res
  if (!res.data || !Array.isArray(res.data.results)) return { ok: false, error: GENERIC_ERROR, status: res.status }
  return res
}

export interface ListParams {
  page?: number
  page_size?: number
  q?: string
}

export async function adminGetStats(days = 30): Promise<ApiResult<AdminStats>> {
  return request<AdminStats>(`/api/admin/stats/${query({ days })}`)
}

export async function adminGetCounters(): Promise<ApiResult<AdminCounters>> {
  return request<AdminCounters>('/api/admin/counters/')
}

export async function adminGetOrders(
  params: ListParams & { status?: OrderStatus | '' } = {},
): Promise<ApiResult<Paged<ApiOrder> & { status_counts: Record<OrderStatus, number> }>> {
  return adminPaged<ApiOrder, { status_counts: Record<OrderStatus, number> }>('/api/admin/orders/', params)
}

export async function adminUpdateOrderStatus(id: number, status: OrderStatus): Promise<ApiResult<ApiOrder | null>> {
  return request<ApiOrder | null>(`/api/admin/orders/${id}/`, { method: 'PATCH', body: { status } })
}

export async function adminGetCustomers(
  params: ListParams & { state?: 'active' | 'blocked' | '' } = {},
): Promise<ApiResult<Paged<AdminCustomer>>> {
  return adminPaged<AdminCustomer>('/api/admin/customers/', params)
}

export async function adminGetCustomer(id: number): Promise<ApiResult<AdminCustomerDetail>> {
  return request<AdminCustomerDetail>(`/api/admin/customers/${id}/`)
}

export async function adminSetCustomerActive(id: number, isActive: boolean): Promise<ApiResult<AdminCustomer>> {
  return request<AdminCustomer>(`/api/admin/customers/${id}/`, { method: 'PATCH', body: { is_active: isActive } })
}

export async function adminGetPayments(
  params: ListParams & { status?: string } = {},
): Promise<ApiResult<Paged<AdminPayment> & { status_counts: Record<string, number> }>> {
  return adminPaged<AdminPayment, { status_counts: Record<string, number> }>('/api/admin/payments/', params)
}

export async function adminReviewPayment(
  id: number, status: 'complete' | 'canceled', note = '',
): Promise<ApiResult<AdminPayment>> {
  return request<AdminPayment>(`/api/admin/payments/${id}/`, { method: 'PATCH', body: { status, note } })
}

export async function adminGetMessages(
  params: ListParams & { state?: 'unread' | 'read' | '' } = {},
): Promise<ApiResult<Paged<AdminMessage> & { unread: number }>> {
  return adminPaged<AdminMessage, { unread: number }>('/api/admin/messages/', params)
}

export async function adminSetMessageRead(id: number, isRead: boolean): Promise<ActionResult> {
  return toAction(await request(`/api/admin/messages/${id}/`, { method: 'PATCH', body: { is_read: isRead } }))
}

export async function adminDeleteMessage(id: number): Promise<ActionResult> {
  return toAction(await request(`/api/admin/messages/${id}/`, { method: 'DELETE' }))
}

export async function adminGetSubscribers(params: ListParams = {}): Promise<ApiResult<Paged<AdminSubscriber>>> {
  return adminPaged<AdminSubscriber>('/api/admin/subscribers/', params)
}

export async function adminDeleteSubscriber(id: number): Promise<ActionResult> {
  return toAction(await request(`/api/admin/subscribers/${id}/`, { method: 'DELETE' }))
}

/** CSV text of active subscribers (the export itself is written to the audit log by the server). */
export async function adminExportSubscribers(): Promise<ApiResult<string>> {
  try {
    const res = await apiFetch('/api/admin/subscribers/?export=csv')
    if (!res.ok) return { ok: false, error: errorForStatus(res.status, null), status: res.status }
    return { ok: true, data: await res.text(), status: res.status }
  } catch {
    return { ok: false, error: NETWORK_ERROR, status: 0 }
  }
}

export async function adminGetSettings(): Promise<ApiResult<AdminStoreSettings>> {
  return request<AdminStoreSettings>('/api/admin/settings/')
}

export async function adminUpdateSettings(
  data: Partial<Omit<AdminStoreSettings, 'updated_at'>>,
): Promise<ApiResult<AdminStoreSettings>> {
  return request<AdminStoreSettings>('/api/admin/settings/', { method: 'PATCH', body: data })
}

export async function adminGetAuditLog(params: ListParams = {}): Promise<ApiResult<Paged<AdminAuditEntry>>> {
  return adminPaged<AdminAuditEntry>('/api/admin/audit/', params)
}

export async function adminGetProducts(
  params: ListParams & { category?: number | ''; state?: 'active' | 'inactive' | 'low' | 'out' | '' } = {},
): Promise<ApiResult<Paged<Product>>> {
  const res = await adminPaged<ApiProduct>('/api/admin/products/', params)
  if (!res.ok) return res
  return { ok: true, status: res.status, data: { ...res.data, results: res.data.results.map(transformProduct) } }
}

export async function adminGetProduct(id: string): Promise<ApiResult<Product>> {
  const res = await request<ApiProduct>(`/api/admin/products/${encodeURIComponent(id)}/`)
  if (!res.ok) return res
  return { ok: true, data: transformProduct(res.data), status: res.status }
}

export async function adminUploadProductPhotos(productId: string, files: File[]): Promise<ActionResult> {
  const formData = new FormData()
  files.forEach((f) => formData.append('photos', f))
  return toAction(await request(`/api/admin/products/${encodeURIComponent(productId)}/photos/`, {
    method: 'POST', body: formData,
  }))
}

export async function adminDeleteProductPhoto(photoId: number): Promise<ActionResult> {
  return toAction(await request(`/api/admin/photos/${photoId}/`, { method: 'DELETE' }))
}

export async function adminDeleteColorPhoto(photoId: number): Promise<ActionResult> {
  return toAction(await request(`/api/admin/color-photos/${photoId}/`, { method: 'DELETE' }))
}

export async function adminUpdateColorVariant(
  variantId: number, data: { name?: string; hex_code?: string },
): Promise<ActionResult> {
  return toAction(await request(`/api/admin/colors/${variantId}/`, { method: 'PATCH', body: data }))
}

export async function adminUpdateStorageOption(
  optionId: number, data: { label?: string; storage?: string; ram?: string; price?: number },
): Promise<ActionResult> {
  return toAction(await request(`/api/admin/storage/${optionId}/`, { method: 'PATCH', body: data }))
}

export async function adminCreateProduct(formData: FormData): Promise<ApiResult<Product>> {
  const res = await request<ApiProduct>('/api/admin/products/', { method: 'POST', body: formData })
  if (!res.ok) return res
  if (!res.data || typeof res.data.id !== 'number') return { ok: false, error: GENERIC_ERROR, status: res.status }
  return { ok: true, data: transformProduct(res.data), status: res.status }
}

export async function adminUpdateProduct(id: string, formData: FormData): Promise<ActionResult> {
  return toAction(await request(`/api/admin/products/${encodeURIComponent(id)}/`, { method: 'PATCH', body: formData }))
}

export async function adminDeleteProduct(id: string): Promise<ActionResult> {
  return toAction(await request(`/api/admin/products/${encodeURIComponent(id)}/`, { method: 'DELETE' }))
}

export async function adminAddColorVariant(
  productId: string,
  data: { name: string; hex_code: string }
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const res = await request<{ id?: number }>(`/api/admin/products/${encodeURIComponent(productId)}/colors/`, {
    method: 'POST', body: data,
  })
  if (!res.ok) return { ok: false, error: res.error }
  if (typeof res.data?.id !== 'number') return { ok: false, error: GENERIC_ERROR }
  return { ok: true, id: res.data.id }
}

export async function adminUploadColorPhotos(variantId: number, files: File[]): Promise<ActionResult> {
  const formData = new FormData()
  files.forEach((f) => formData.append('photos', f))
  return toAction(await request(`/api/admin/colors/${variantId}/photos/`, { method: 'POST', body: formData }))
}

export async function adminAddStorageOption(
  productId: string,
  data: { label: string; storage: string; ram: string; price: number }
): Promise<ActionResult> {
  return toAction(await request(`/api/admin/products/${encodeURIComponent(productId)}/storage/`, {
    method: 'POST', body: data,
  }))
}

export async function adminDeleteColorVariant(variantId: number): Promise<ActionResult> {
  return toAction(await request(`/api/admin/colors/${variantId}/`, { method: 'DELETE' }))
}

export async function adminDeleteStorageOption(optionId: number): Promise<ActionResult> {
  return toAction(await request(`/api/admin/storage/${optionId}/`, { method: 'DELETE' }))
}

export async function adminGetCategories(): Promise<ApiResult<Category[]>> {
  const res = await adminList<ApiCategory>('/api/admin/categories/')
  if (!res.ok) return res
  return { ok: true, data: res.data.map(transformCategory), status: res.status }
}

function categoryForm(title: string, photo: File | null): FormData {
  const fd = new FormData()
  fd.append('title', title)
  if (photo) fd.append('photo', photo)
  return fd
}

export async function adminCreateCategory(title: string, photo: File | null): Promise<ActionResult> {
  return toAction(await request('/api/admin/categories/', { method: 'POST', body: categoryForm(title, photo) }))
}

export async function adminUpdateCategory(id: number, title: string, photo: File | null): Promise<ActionResult> {
  return toAction(await request(`/api/admin/categories/${id}/`, { method: 'PATCH', body: categoryForm(title, photo) }))
}

export async function adminDeleteCategory(id: number): Promise<ActionResult> {
  return toAction(await request(`/api/admin/categories/${id}/`, { method: 'DELETE' }))
}
