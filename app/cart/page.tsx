"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { CartEmpty } from "@/components/cart/cart-empty"
import { CartSummary } from "@/components/cart/cart-summary"
import { Button } from "@/components/ui/button"
import { Minus, Plus, Trash2, Loader2 } from "lucide-react"
import { useStore } from "@/lib/store-context"
import { useMoney } from "@/lib/currency"

export default function CartPage() {
  const {
    cart,
    cartCount,
    cartTotal,
    cartLoading,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    refreshCart,
    isLoggedIn,
    authReady,
  } = useStore()
  const { format } = useMoney()

  // id of the line with a request in flight (prevents double clicks racing each other)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    void refreshCart()
  }, [refreshCart])

  const isEmpty = cart.length === 0

  async function changeQuantity(cartItemId: number, quantity: number) {
    if (busyId !== null) return
    setBusyId(cartItemId)
    await updateCartQuantity(cartItemId, quantity)
    setBusyId(null)
  }

  async function remove(cartItemId: number) {
    if (busyId !== null) return
    setBusyId(cartItemId)
    await removeFromCart(cartItemId)
    setBusyId(null)
  }

  async function handleClear() {
    if (clearing) return
    if (!window.confirm("Savatdagi barcha mahsulotlar o'chirilsinmi?")) return
    setClearing(true)
    await clearCart()
    setClearing(false)
  }

  return (
    <>
      <Header />
      <main id="main-content" className="pt-16 lg:pt-20 min-h-screen">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl">Savat</h1>
              {!isEmpty && (
                <p className="mt-2 text-muted-foreground">
                  {cartCount} ta mahsulot
                </p>
              )}
            </div>
            {!isEmpty && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleClear}
                disabled={clearing}
              >
                Savatni tozalash
              </Button>
            )}
          </div>

          {authReady && !isLoggedIn && !isEmpty && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Savatingiz faqat bu qurilmada saqlanmoqda. Buyurtma berish uchun{" "}
              <Link href="/account?next=/cart" className="font-medium underline">
                hisobingizga kiring
              </Link>{" "}
              — savatdagi mahsulotlar hisobingizga ko'chiriladi.
            </div>
          )}

          {cartLoading && isEmpty ? (
            <div className="flex items-center justify-center py-24" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Savat yuklanmoqda…</span>
            </div>
          ) : isEmpty ? (
            <CartEmpty />
          ) : (
            <div className="grid gap-8 lg:grid-cols-3 lg:gap-12">
              {/* Cart Items */}
              <div className="lg:col-span-2 space-y-6">
                {/* Table header */}
                <div className="hidden sm:grid sm:grid-cols-12 sm:gap-4 pb-4 border-b border-border text-sm font-medium text-muted-foreground" aria-hidden="true">
                  <div className="col-span-6">Mahsulot</div>
                  <div className="col-span-2 text-center">Narx</div>
                  <div className="col-span-2 text-center">Miqdor</div>
                  <div className="col-span-2 text-right">Jami</div>
                </div>

                <ul className="space-y-6">
                  {cart.map((item) => {
                    const busy = busyId === item.cartItemId
                    const atMax = item.quantity >= item.maxQuantity
                    return (
                      <li
                        key={item.cartItemId}
                        className="rounded-2xl bg-card p-4 sm:p-6 border border-border"
                        aria-busy={busy}
                      >
                        <div className="sm:grid sm:grid-cols-12 sm:gap-4 sm:items-center">
                          {/* Product Info */}
                          <div className="col-span-6 flex gap-4">
                            <Link
                              href={`/product/${item.id}`}
                              tabIndex={-1}
                              aria-hidden="true"
                              className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-secondary"
                            >
                              <Image
                                src={item.image}
                                alt=""
                                fill
                                sizes="96px"
                                className="object-cover"
                              />
                            </Link>
                            <div className="flex flex-col justify-center py-1 min-w-0">
                              <Link
                                href={`/product/${item.id}`}
                                className="font-medium hover:text-muted-foreground transition-colors"
                              >
                                {item.name}
                              </Link>
                              {item.variantLabel && (
                                <p className="mt-1 text-sm text-muted-foreground">{item.variantLabel}</p>
                              )}
                              {atMax && (
                                <p className="mt-1 text-xs text-amber-700">
                                  Omborda {item.maxQuantity} dona bor
                                </p>
                              )}
                              <p className="mt-1 text-sm text-muted-foreground sm:hidden">
                                {format(item.price)}
                              </p>
                            </div>
                          </div>

                          {/* Price */}
                          <div className="hidden sm:block col-span-2 text-center">
                            <span className="font-medium">{format(item.price)}</span>
                          </div>

                          {/* Quantity */}
                          <div className="col-span-2 mt-4 sm:mt-0 flex justify-center">
                            <div className="flex items-center rounded-lg border border-border" role="group" aria-label={`${item.name} miqdori`}>
                              <button
                                type="button"
                                onClick={() => changeQuantity(item.cartItemId, item.quantity - 1)}
                                className="p-2 hover:bg-secondary transition-colors rounded-l-lg disabled:opacity-40"
                                disabled={busy || item.quantity <= 1}
                                aria-label="Kamaytirish"
                              >
                                <Minus className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <span className="w-10 text-center text-sm font-medium" aria-live="polite">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => changeQuantity(item.cartItemId, item.quantity + 1)}
                                className="p-2 hover:bg-secondary transition-colors rounded-r-lg disabled:opacity-40"
                                disabled={busy || atMax}
                                aria-label="Oshirish"
                              >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {/* Total */}
                          <div className="col-span-2 mt-4 sm:mt-0 flex items-center justify-between sm:justify-end gap-4">
                            <span className="text-sm text-muted-foreground sm:hidden">Jami</span>
                            <span className="font-semibold">{format(item.lineTotal)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-4 mt-4 pt-4 border-t border-border">
                          <button
                            type="button"
                            onClick={() => remove(item.cartItemId)}
                            disabled={busy}
                            aria-label={`${item.name} — savatdan o'chirish`}
                            className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            O'chirish
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* Summary */}
              <div>
                <CartSummary total={cartTotal} isLoggedIn={isLoggedIn} />
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
