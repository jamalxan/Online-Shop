"use client"

import { useState, useEffect, useCallback, useId, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { cancelOrder, fetchStoreInfoFresh, getMyOrders, getMyPayments, getImageUrl, submitPaymentReceipt } from "@/lib/api"
import type { ApiOrder, ApiPayment, PaymentStatus, StoreInfo } from "@/lib/types"
import { ChevronRight, CreditCard, Package, Loader2, ShoppingBag, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useStore } from "@/lib/store-context"
import { formatDate, toNumber } from "@/lib/utils"
import { useMoney } from "@/lib/currency"
import { isOnlinePayment, paymentMethodName } from "@/lib/payments"

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024

const PAYMENT_LABELS: Record<PaymentStatus, { text: string; className: string }> = {
  review: { text: "To'lov tekshirilmoqda", className: "bg-yellow-100 text-yellow-900" },
  complete: { text: "To'langan", className: "bg-green-100 text-green-900" },
  canceled: { text: "To'lov rad etilgan", className: "bg-red-100 text-red-800" },
}

/**
 * Optional prepayment by card transfer. Shown only when the shop has published a card
 * (admin → Sozlamalar). The amount is fixed by the server — the customer only attaches the receipt.
 */
function PrepayPanel({ checkoutId, amount, rate, card, rejectedNote, onSent }: {
  checkoutId: string
  amount: number
  /** exchange rate the checkout was placed at */
  rate?: number
  card: NonNullable<StoreInfo["card_payment"]>
  rejectedNote?: string
  onSent: () => void
}) {
  const inputId = useId()
  const { currency, format, formatIn } = useMoney()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null
    event.target.value = ""
    if (!picked) return
    if (!picked.type.startsWith("image/") || picked.size > MAX_RECEIPT_BYTES) {
      setFile(null)
      setError("Faqat 5 MB gacha bo'lgan rasm (JPG, PNG) qabul qilinadi")
      return
    }
    setError("")
    setFile(picked)
  }

  const send = async () => {
    if (!file || busy) return
    setBusy(true)
    setError("")
    const res = await submitPaymentReceipt(checkoutId, file)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    onSent()
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CreditCard className="h-4 w-4" aria-hidden="true" />
        Oldindan to&apos;lash (ixtiyoriy)
      </p>
      {rejectedNote && (
        <p className="mt-2 text-sm text-red-800">Oldingi chek rad etildi: {rejectedNote}</p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">
          {format(amount, rate)}
          {/* the card is a so'm card: someone reading prices in dollars still needs the so'm sum */}
          {currency === "USD" && formatIn(amount, "UZS", rate) !== null && ` (${formatIn(amount, "UZS", rate)})`}
        </span> ni quyidagi kartaga o&apos;tkazing va chek rasmini yuklang.
        To&apos;lamasangiz ham bo&apos;ladi — buyurtmani qabul qilganda to&apos;laysiz.
      </p>
      <p className="mt-3 font-mono text-base tracking-wider">{card.card_number}</p>
      {card.card_holder && <p className="text-xs text-muted-foreground">{card.card_holder}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-ring">
          <Upload className="h-4 w-4" aria-hidden="true" />
          {file ? file.name.slice(0, 28) : "Chek rasmini tanlash"}
          <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={pick} />
        </label>
        <Button size="sm" className="rounded-xl" disabled={!file || busy} onClick={() => void send()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Chekni yuborish
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  preparing: "bg-blue-100 text-blue-800",
  shipping: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  canceled: "bg-red-100 text-red-700",
}

const DELIVERY_LABELS: Record<string, string> = {
  standard: "Standart yetkazib berish",
  express: "Tezkor yetkazib berish",
  pickup: "Do'kondan olib ketish",
}

export default function OrdersPage() {
  const router = useRouter()
  const { user, authReady, showNotification } = useStore()
  const { format } = useMoney()
  const [orders, setOrders] = useState<ApiOrder[]>([])
  const [payments, setPayments] = useState<ApiPayment[]>([])
  // Payment requisites are read fresh on every load — never from the cached page shell.
  const [card, setCard] = useState<StoreInfo["card_payment"]>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cancelingId, setCancelingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const [res, paid, info] = await Promise.all([getMyOrders(), getMyPayments(), fetchStoreInfoFresh()])
    if (res.ok) setOrders(res.data)
    else setError(res.error)
    if (paid.ok) setPayments(paid.data)
    setCard(info?.card_payment ?? null)
    setLoading(false)
  }, [])

  // One prepay panel per checkout: attached to its first (newest) order, for the sum of its live orders.
  const prepay = useMemo(() => {
    // The server charges the sum of every non-cancelled order of the checkout — mirror exactly that.
    const totals = new Map<string, { firstOrderId: number; amount: number; payable: boolean }>()
    for (const order of orders) {
      const id = order.checkout_id
      if (!id || order.status === "canceled") continue
      const open = order.status === "pending" || order.status === "preparing"
      const unpaid = !order.payment_status || order.payment_status === "canceled"
      const entry = totals.get(id)
      if (entry) {
        entry.amount += toNumber(order.total_price)
        entry.payable = entry.payable || (open && unpaid)
      } else {
        totals.set(id, { firstOrderId: order.id, amount: toNumber(order.total_price), payable: open && unpaid })
      }
    }
    for (const [id, entry] of totals) if (!entry.payable) totals.delete(id)
    return totals
  }, [orders])

  const rejectionNote = useCallback(
    (checkoutId: string) => payments.find((p) => p.checkout_id === checkoutId && p.status === "canceled")?.note ?? "",
    [payments],
  )

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      router.replace("/account?next=/account/orders")
      return
    }
    void load()
  }, [authReady, user, router, load])

  async function handleCancel(order: ApiOrder) {
    if (cancelingId !== null) return
    if (!window.confirm(`#${order.id} buyurtma bekor qilinsinmi?`)) return
    setCancelingId(order.id)
    const res = await cancelOrder(order.id)
    setCancelingId(null)
    if (!res.ok) {
      showNotification(res.error, "error")
      void load() // the status probably changed in the meantime
      return
    }
    const updated = res.data
    if (updated && typeof updated.id === "number") {
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    } else {
      void load()
    }
    showNotification("Buyurtma bekor qilindi", "success")
  }

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen bg-background pt-24 pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
            <Link href="/" className="hover:text-foreground">Bosh sahifa</Link>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            <Link href="/account" className="hover:text-foreground">Hisob</Link>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            <span className="text-foreground" aria-current="page">Buyurtmalarim</span>
          </nav>

          <h1 className="text-2xl font-semibold mb-8">Buyurtmalarim</h1>

          {loading || !user ? (
            <div className="flex items-center justify-center py-20" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Yuklanmoqda…</span>
            </div>
          ) : error ? (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm text-red-700">{error}</p>
              <Button variant="outline" className="mt-4 rounded-xl" onClick={() => void load()}>
                Qayta urinish
              </Button>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package className="h-16 w-16 text-muted-foreground mb-4" aria-hidden="true" />
              <h2 className="text-xl font-semibold">Buyurtmalar yo'q</h2>
              <p className="mt-2 text-muted-foreground">Hali hech qanday buyurtma bermagansiz.</p>
              <Button asChild className="mt-6 rounded-xl">
                <Link href="/products">
                  <ShoppingBag className="mr-2 h-4 w-4" aria-hidden="true" />
                  Xarid qilishni boshlash
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-4">
              {orders.map((order) => {
                const variant = [order.storage_label, order.color_name].filter(Boolean).join(" · ")
                return (
                  <li key={order.id} className="rounded-2xl border border-border bg-card p-6">
                    <div className="flex items-start justify-between gap-4">
                      {/* Product */}
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-secondary">
                          <Image
                            src={getImageUrl(order.product?.thumbnail_photo)}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <h2 className="font-medium">{order.product?.title ?? "Mahsulot"}</h2>
                          {variant && <p className="text-sm text-muted-foreground">{variant}</p>}
                          {/* price snapshot taken at purchase time, not the current product price */}
                          <p className="text-sm text-muted-foreground">
                            {order.quantity} dona × {format(order.unit_price, order.usd_rate)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            #{order.id} · {formatDate(order.created_at)}
                            {order.delivery_method && DELIVERY_LABELS[order.delivery_method]
                              ? ` · ${DELIVERY_LABELS[order.delivery_method]}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-secondary text-foreground"}`}>
                          {order.status_display}
                        </span>
                        <span className="font-semibold">{format(order.total_price, order.usd_rate)}</span>
                        {order.payment_status && PAYMENT_LABELS[order.payment_status] && (
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${PAYMENT_LABELS[order.payment_status].className}`}>
                            {PAYMENT_LABELS[order.payment_status].text}
                            {/* a demo payment took no money: never shown as a plain "paid" */}
                            {order.payment_demo && " (demo)"}
                          </span>
                        )}
                        {isOnlinePayment(order.payment_method) && (
                          <span className="text-xs text-muted-foreground">{paymentMethodName(order.payment_method)} orqali</span>
                        )}
                      </div>
                    </div>

                    {card && order.checkout_id && prepay.get(order.checkout_id)?.firstOrderId === order.id && (
                      <PrepayPanel
                        checkoutId={order.checkout_id}
                        amount={prepay.get(order.checkout_id)!.amount}
                        rate={order.usd_rate}
                        card={card}
                        rejectedNote={order.payment_status === "canceled" ? rejectionNote(order.checkout_id) : undefined}
                        onSent={() => { showNotification("Chek yuborildi. Tekshirilgach, holat yangilanadi.", "success"); void load() }}
                      />
                    )}

                    {order.status === "pending" && (
                      <div className="mt-4 flex justify-end border-t border-border pt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-destructive hover:text-destructive"
                          disabled={cancelingId !== null}
                          onClick={() => handleCancel(order)}
                        >
                          {cancelingId === order.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                          Bekor qilish
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
