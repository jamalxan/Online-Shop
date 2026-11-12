"use client"

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react"
import {
  AUTH_LOGOUT_EVENT,
  AUTH_SYNC_EVENT,
  getToken,
  restoreSession,
  getCart,
  addToCart as apiAddToCart,
  updateCartItem,
  removeCartItem,
  clearCart as apiClearCart,
  getProfile,
  logout as apiLogout,
  getWishlist,
  addToWishlistApi,
  removeFromWishlistApi,
  getImageUrl,
  EMPTY_STORE_INFO,
} from "./api"
import type { ApiCart, ApiCartItem, ApiProduct, Category, StoreInfo, UserProfile } from "./types"
import { setActiveCurrency, toNumber } from "./utils"

// ─── Types ────────────────────────────────────────────────

/** Minimal product shape used by cart / wishlist actions. */
export interface Product {
  id: string
  name: string
  price: number
  originalPrice?: number
  image: string
  category: string
  /** stock */
  quantity?: number
}

/** Variant selected on the product page. */
export interface CartVariant {
  storageOptionId?: number
  colorVariantId?: number
  /** e.g. "256GB · Qora" — shown on cart / checkout lines */
  label?: string
}

export interface CartItem {
  cartItemId: number   // backend cart item id (guest: local temp id)
  id: string           // product id
  name: string
  price: number        // unit price (server-computed when logged in)
  lineTotal: number    // server line total when logged in, price × quantity for guests
  image: string
  category: string
  quantity: number
  maxQuantity: number  // stock
  storageOptionId?: number
  colorVariantId?: number
  variantLabel?: string
}

type Notification = { message: string; type: "success" | "error" }

interface StoreContextType {
  // Auth
  user: UserProfile | null
  isLoggedIn: boolean
  /** false until the first profile check has finished (avoid redirecting before that) */
  authReady: boolean
  refreshUser: () => Promise<UserProfile | null>
  logout: () => void

  // Catalog
  categories: Category[]
  /** Contact details and payment requisites managed in the admin panel (empty fields are not shown). */
  store: StoreInfo

  // Cart (backend synced when logged in, localStorage when guest)
  cart: CartItem[]
  cartCount: number
  cartTotal: number
  cartLoading: boolean
  addToCart: (product: Product, quantity?: number, variant?: CartVariant) => Promise<boolean>
  removeFromCart: (cartItemId: number) => Promise<void>
  updateCartQuantity: (cartItemId: number, quantity: number) => Promise<void>
  clearCart: () => Promise<void>
  refreshCart: () => Promise<void>

  // Wishlist (localStorage for guests, backend when logged in)
  wishlist: Product[]
  addToWishlist: (product: Product) => Promise<void>
  removeFromWishlist: (productId: string) => Promise<void>
  isInWishlist: (productId: string) => boolean

  // Notifications
  notification: Notification | null
  showNotification: (message: string, type: "success" | "error") => void
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

// ─── localStorage helpers (contents are untrusted → validated on read) ───
const GUEST_CART_KEY = "guest_cart"
const WISHLIST_KEY = "wishlist"
const MAX_STOCK_FALLBACK = 99

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full / blocked — state simply won't persist
  }
}

function optionalId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined
}

function loadGuestCart(): CartItem[] {
  const data = readJson(GUEST_CART_KEY)
  if (!Array.isArray(data)) return []
  const items: CartItem[] = []
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    if (typeof r.id !== "string" || !/^\d+$/.test(r.id) || typeof r.name !== "string") continue
    const price = toNumber(r.price as number)
    const maxQuantity = Math.max(0, Math.floor(toNumber(r.maxQuantity as number))) || MAX_STOCK_FALLBACK
    const quantity = Math.min(Math.max(1, Math.floor(toNumber(r.quantity as number))), maxQuantity)
    items.push({
      cartItemId: typeof r.cartItemId === "number" ? r.cartItemId : Date.now() + items.length,
      id: r.id,
      name: r.name,
      price,
      lineTotal: price * quantity,
      image: typeof r.image === "string" && r.image ? r.image : "/placeholder.jpg",
      category: typeof r.category === "string" ? r.category : "",
      quantity,
      maxQuantity,
      storageOptionId: optionalId(r.storageOptionId),
      colorVariantId: optionalId(r.colorVariantId),
      variantLabel: typeof r.variantLabel === "string" ? r.variantLabel : undefined,
    })
  }
  return items
}

function saveGuestCart(cart: CartItem[]) {
  writeJson(GUEST_CART_KEY, cart)
}

function loadLocalWishlist(): Product[] {
  const data = readJson(WISHLIST_KEY)
  if (!Array.isArray(data)) return []
  const items: Product[] = []
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    if (typeof r.id !== "string" || !/^\d+$/.test(r.id) || typeof r.name !== "string") continue
    items.push({
      id: r.id,
      name: r.name,
      price: toNumber(r.price as number),
      originalPrice: typeof r.originalPrice === "number" ? r.originalPrice : undefined,
      image: typeof r.image === "string" && r.image ? r.image : "/placeholder.jpg",
      category: typeof r.category === "string" ? r.category : "",
    })
  }
  return items
}

/** Same product with a different storage / colour is a separate line. */
function lineKey(productId: string, storageOptionId?: number, colorVariantId?: number): string {
  return `${productId}:${storageOptionId ?? ""}:${colorVariantId ?? ""}`
}

function variantLabelOf(item: ApiCartItem): string | undefined {
  const parts: string[] = []
  if (item.storage_option) {
    const s = item.storage_option
    parts.push(s.ram ? `${s.storage} / ${s.ram}` : s.storage || s.label)
  }
  if (item.color_variant) parts.push(item.color_variant.name)
  return parts.length ? parts.join(" · ") : undefined
}

function apiCartToItems(apiCart: ApiCart): CartItem[] {
  return [...apiCart.items]
    .sort((a, b) => a.id - b.id) // stable order
    .map((item) => {
      const quantity = Math.max(1, item.quantity)
      const lineTotal = toNumber(item.total)
      // the server is the source of truth for prices
      const price = item.unit_price !== undefined ? toNumber(item.unit_price) : lineTotal / quantity
      return {
        cartItemId: item.id,
        id: String(item.product.id),
        name: item.product.title,
        price,
        lineTotal,
        image: getImageUrl(item.product.thumbnail_photo),
        category: typeof item.product.category === "string" ? item.product.category : "",
        quantity: item.quantity,
        maxQuantity: item.product.quantity ?? MAX_STOCK_FALLBACK,
        storageOptionId: item.storage_option?.id,
        colorVariantId: item.color_variant?.id,
        variantLabel: variantLabelOf(item),
      }
    })
}

function apiProductToWishlistItem(p: ApiProduct): Product {
  const price = toNumber(p.final_price ?? p.price)
  const base = toNumber(p.price)
  return {
    id: String(p.id),
    name: p.title,
    price,
    originalPrice: base > price ? base : undefined,
    image: getImageUrl(p.thumbnail_photo),
    category: typeof p.category === "string" ? p.category : "",
    quantity: p.quantity,
  }
}

// Single-flight guards (module level so React strict-mode double effects can't duplicate work)
let guestMergePromise: Promise<string[]> | null = null

/**
 * Replays the guest (localStorage) cart into the server cart after login.
 * Returns the names of lines the server rejected (out of stock, inactive…).
 */
function mergeGuestCart(): Promise<string[]> {
  if (guestMergePromise) return guestMergePromise
  const lines = loadGuestCart()
  if (lines.length === 0) return Promise.resolve([])
  // Claim the lines first so a concurrent call can never replay them twice.
  saveGuestCart([])
  guestMergePromise = (async () => {
    const rejected: string[] = []
    for (const line of lines) {
      const res = await apiAddToCart({
        product_id: Number(line.id),
        quantity: line.quantity,
        storage_option_id: line.storageOptionId,
        color_variant_id: line.colorVariantId,
      })
      if (!res.ok) rejected.push(line.name)
    }
    return rejected
  })().finally(() => {
    guestMergePromise = null
  })
  return guestMergePromise
}

// ─── Provider ─────────────────────────────────────────────

export function StoreProvider({
  children,
  initialCategories = [],
  initialStore = EMPTY_STORE_INFO,
}: {
  children: ReactNode
  initialCategories?: Category[]
  initialStore?: StoreInfo
}) {
  // Runs before any child renders (during SSR and in the browser), so every formatPrice() call
  // below this provider uses the shop's currency.
  setActiveCurrency(initialStore.currency)

  const [user, setUser] = useState<UserProfile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartLoading, setCartLoading] = useState(false)
  const [wishlist, setWishlist] = useState<Product[]>([])
  const [notification, setNotification] = useState<Notification | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotification = useCallback((message: string, type: "success" | "error") => {
    setNotification({ message, type })
    if (notificationTimer.current) clearTimeout(notificationTimer.current)
    notificationTimer.current = setTimeout(() => setNotification(null), 3500)
  }, [])

  useEffect(() => () => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current)
  }, [])

  // ── Refresh user profile (+ wishlist) ─────────────────
  const refreshUser = useCallback(async (): Promise<UserProfile | null> => {
    // the access token lives in memory only: after a page load it has to be fetched first
    if (!(await restoreSession())) {
      setUser(null)
      setAuthReady(true)
      return null
    }
    const profile = await getProfile()
    setUser(profile)
    setAuthReady(true)
    if (!profile) return null

    const apiWishlist = await getWishlist()
    if (apiWishlist) {
      const serverItems = apiWishlist.products.map(apiProductToWishlistItem)
      const serverIds = new Set(serverItems.map((p) => p.id))
      // items saved while logged out are pushed to the account, not lost
      const localOnly = loadLocalWishlist().filter((p) => !serverIds.has(p.id))
      const kept: Product[] = []
      for (const item of localOnly) {
        const res = await addToWishlistApi(Number(item.id))
        if (res.ok) kept.push(item)
      }
      setWishlist([...serverItems, ...kept])
    }
    return profile
  }, [])

  // ── Refresh cart (merges the guest cart into the server cart once logged in) ──
  const refreshCart = useCallback(async () => {
    if (!(await restoreSession())) {
      setCart(loadGuestCart())
      return
    }
    setCartLoading(true)
    const rejected = await mergeGuestCart()
    const apiCart = await getCart()
    setCartLoading(false)
    if (apiCart) setCart(apiCartToItems(apiCart))
    else if (!getToken()) setCart(loadGuestCart())
    if (rejected.length > 0) {
      showNotification(`Savatga qo'shib bo'lmadi: ${rejected.join(", ")}`, "error")
    }
  }, [showNotification])

  // ── On mount: load wishlist, user, cart ───────────────
  useEffect(() => {
    setWishlist(loadLocalWishlist())
    setHydrated(true)
    void refreshUser()
    void refreshCart()
  }, [refreshUser, refreshCart])

  // Persist wishlist
  useEffect(() => {
    if (hydrated) writeJson(WISHLIST_KEY, wishlist)
  }, [wishlist, hydrated])

  // ── Session ended (refresh token rejected) ────────────
  useEffect(() => {
    const onForcedLogout = () => {
      setUser(null)
      setWishlist([])
      setCart(loadGuestCart())
    }
    // another tab signed in (possibly as someone else): the cookie is shared, reload from it
    const onSessionChanged = () => {
      void refreshUser()
      void refreshCart()
    }
    window.addEventListener(AUTH_LOGOUT_EVENT, onForcedLogout)
    window.addEventListener(AUTH_SYNC_EVENT, onSessionChanged)
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onForcedLogout)
      window.removeEventListener(AUTH_SYNC_EVENT, onSessionChanged)
    }
  }, [refreshUser, refreshCart])

  // ── Logout ────────────────────────────────────────────
  const logout = useCallback(() => {
    apiLogout()
    setUser(null)
    setWishlist([]) // account data must not stay on a shared device
    setCart(loadGuestCart())
    showNotification("Hisobdan chiqildi", "success")
  }, [showNotification])

  // ── Add to cart ───────────────────────────────────────
  const addToCart = useCallback(async (product: Product, quantity = 1, variant?: CartVariant): Promise<boolean> => {
    const qty = Math.max(1, Math.floor(quantity))

    if (!(await restoreSession())) {
      // Guest mode: localStorage. Variant ids are kept so the line can be replayed after login.
      const guestCart = loadGuestCart()
      const key = lineKey(product.id, variant?.storageOptionId, variant?.colorVariantId)
      const existing = guestCart.find((i) => lineKey(i.id, i.storageOptionId, i.colorVariantId) === key)
      const maxQty = product.quantity ?? existing?.maxQuantity ?? MAX_STOCK_FALLBACK
      if (maxQty <= 0) {
        showNotification("Mahsulot tugagan", "error")
        return false
      }
      if (existing && existing.quantity >= maxQty) {
        showNotification(`Omborda faqat ${maxQty} dona bor`, "error")
        return false
      }
      let updated: CartItem[]
      if (existing) {
        updated = guestCart.map((i) => {
          if (i !== existing) return i
          const nextQty = Math.min(i.quantity + qty, maxQty)
          return { ...i, quantity: nextQty, maxQuantity: maxQty, price: product.price, lineTotal: product.price * nextQty }
        })
      } else {
        const nextQty = Math.min(qty, maxQty)
        updated = [
          ...guestCart,
          {
            cartItemId: Date.now() + Math.floor(Math.random() * 1000), // temp id for guest lines
            id: product.id,
            name: product.name,
            price: product.price,
            lineTotal: product.price * nextQty,
            image: product.image,
            category: product.category,
            quantity: nextQty,
            maxQuantity: maxQty,
            storageOptionId: variant?.storageOptionId,
            colorVariantId: variant?.colorVariantId,
            variantLabel: variant?.label,
          },
        ]
      }
      saveGuestCart(updated)
      setCart(updated)
      showNotification(`${product.name} savatga qo'shildi`, "success")
      return true
    }

    const result = await apiAddToCart({
      product_id: Number(product.id),
      quantity: qty,
      storage_option_id: variant?.storageOptionId,
      color_variant_id: variant?.colorVariantId,
    })
    if (!result.ok) {
      showNotification(result.error, "error")
      return false
    }
    if (result.cart) setCart(apiCartToItems(result.cart))
    else await refreshCart()
    showNotification(`${product.name} savatga qo'shildi`, "success")
    return true
  }, [showNotification, refreshCart])

  // ── Remove from cart ──────────────────────────────────
  const removeFromCart = useCallback(async (cartItemId: number) => {
    if (!(await restoreSession())) {
      const updated = loadGuestCart().filter((i) => i.cartItemId !== cartItemId)
      saveGuestCart(updated)
      setCart(updated)
      showNotification("Mahsulot o'chirildi", "success")
      return
    }
    const result = await removeCartItem(cartItemId)
    if (!result.ok) {
      showNotification(result.error, "error")
      return
    }
    if (result.cart) setCart(apiCartToItems(result.cart))
    else await refreshCart()
    showNotification("Mahsulot o'chirildi", "success")
  }, [showNotification, refreshCart])

  // ── Update quantity (clamped to stock) ────────────────
  const updateCartQuantity = useCallback(async (cartItemId: number, quantity: number) => {
    if (quantity < 1) { await removeFromCart(cartItemId); return }

    if (!(await restoreSession())) {
      const updated = loadGuestCart().map((i) => {
        if (i.cartItemId !== cartItemId) return i
        const nextQty = Math.min(Math.floor(quantity), i.maxQuantity)
        return { ...i, quantity: nextQty, lineTotal: i.price * nextQty }
      })
      saveGuestCart(updated)
      setCart(updated)
      return
    }
    const result = await updateCartItem(cartItemId, Math.floor(quantity))
    if (!result.ok) {
      showNotification(result.error, "error")
      return
    }
    if (result.cart) setCart(apiCartToItems(result.cart))
    else await refreshCart()
  }, [removeFromCart, showNotification, refreshCart])

  // ── Clear cart ────────────────────────────────────────
  const clearCartFn = useCallback(async () => {
    if (!(await restoreSession())) {
      saveGuestCart([])
      setCart([])
      return
    }
    const result = await apiClearCart()
    if (!result.ok) {
      showNotification(result.error, "error")
      return
    }
    setCart([])
  }, [showNotification])

  // ── Wishlist ──────────────────────────────────────────
  const addToWishlist = useCallback(async (product: Product) => {
    if (wishlist.some((p) => p.id === product.id)) return
    const item: Product = {
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice,
      image: product.image,
      category: product.category,
      quantity: product.quantity,
    }
    setWishlist((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]))
    if (await restoreSession()) {
      const res = await addToWishlistApi(Number(product.id))
      if (!res.ok) {
        setWishlist((prev) => prev.filter((p) => p.id !== item.id)) // roll back
        showNotification(res.error, "error")
        return
      }
    }
    showNotification(`${product.name} sevimlilarga qo'shildi`, "success")
  }, [wishlist, showNotification])

  const removeFromWishlist = useCallback(async (productId: string) => {
    const removed = wishlist.find((p) => p.id === productId)
    if (!removed) return
    setWishlist((prev) => prev.filter((p) => p.id !== productId))
    if (await restoreSession()) {
      const res = await removeFromWishlistApi(Number(productId))
      if (!res.ok) {
        setWishlist((prev) => (prev.some((p) => p.id === productId) ? prev : [...prev, removed])) // roll back
        showNotification(res.error, "error")
        return
      }
    }
    showNotification("Sevimlilardan o'chirildi", "success")
  }, [wishlist, showNotification])

  const isInWishlist = useCallback((productId: string) => {
    return wishlist.some((p) => p.id === productId)
  }, [wishlist])

  const cartTotal = cart.reduce((sum, item) => sum + item.lineTotal, 0)
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const value = useMemo<StoreContextType>(() => ({
    user,
    isLoggedIn: !!user,
    authReady,
    refreshUser,
    logout,
    categories: initialCategories,
    store: initialStore,
    cart,
    cartCount,
    cartTotal,
    cartLoading,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart: clearCartFn,
    refreshCart,
    wishlist,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    notification,
    showNotification,
  }), [
    user, authReady, refreshUser, logout, initialCategories, initialStore, cart, cartCount, cartTotal, cartLoading,
    addToCart, removeFromCart, updateCartQuantity, clearCartFn, refreshCart,
    wishlist, addToWishlist, removeFromWishlist, isInWishlist, notification, showNotification,
  ])

  return (
    <StoreContext.Provider value={value}>
      {children}
      {/* Announced to screen readers */}
      <div aria-live="polite" role="status" className="fixed bottom-4 right-4 z-[110]">
        {notification && (
          <div className="animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div
              className={`rounded-xl px-4 py-3 shadow-lg ${
                notification.type === "success"
                  ? "bg-foreground text-background"
                  : "bg-red-600 text-white"
              }`}
            >
              <p className="text-sm font-medium">{notification.message}</p>
            </div>
          </div>
        )}
      </div>
    </StoreContext.Provider>
  )
}

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) throw new Error("useStore must be used within StoreProvider")
  return context
}
