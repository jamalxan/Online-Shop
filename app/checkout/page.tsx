"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, ShoppingBag } from "lucide-react"
import { Header } from "@/components/layout/header"
import { CheckoutForm } from "@/components/checkout/checkout-form"
import { CheckoutSummary } from "@/components/checkout/checkout-summary"
import { Button } from "@/components/ui/button"
import { useStore } from "@/lib/store-context"

export default function CheckoutPage() {
  const router = useRouter()
  const { user, authReady, cart, cartTotal, cartLoading, refreshCart } = useStore()
  const [cartChecked, setCartChecked] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)

  // Orders require an account. Guests go to login and come back here;
  // their local cart is merged into the account cart right after login.
  useEffect(() => {
    if (authReady && !user) router.replace("/account?next=/checkout")
  }, [authReady, user, router])

  // Always work from the server cart (prices and stock are the server's).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    refreshCart().finally(() => {
      if (!cancelled) setCartChecked(true)
    })
    return () => { cancelled = true }
  }, [user, refreshCart])

  // once an order is placed the form (and its success screen) must stay mounted
  const loading = !orderPlaced && (!authReady || !user || !cartChecked || (cartLoading && cart.length === 0))
  const isEmpty = cart.length === 0 && !orderPlaced

  return (
    <>
      <Header />
      <main id="main-content" className="pt-16 lg:pt-20 min-h-screen bg-secondary/30">
        {loading ? (
          <div className="flex min-h-[60vh] items-center justify-center" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Yuklanmoqda…</span>
          </div>
        ) : isEmpty ? (
          <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
            <h1 className="mt-6 font-serif text-2xl sm:text-3xl">Savatingiz bo'sh</h1>
            <p className="mt-2 text-muted-foreground">Buyurtma berish uchun avval savatga mahsulot qo'shing.</p>
            <Button asChild className="mt-8 rounded-xl" size="lg">
              <Link href="/products">Katalogga o'tish</Link>
            </Button>
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
            <div className="mb-8">
              <h1 className="font-serif text-3xl sm:text-4xl">Buyurtmani rasmiylashtirish</h1>
              {!orderPlaced && (
                <p className="mt-2 text-muted-foreground">Manzil va to'lov usulini keyingi bosqichlarda tanlaysiz</p>
              )}
            </div>

            <div className="grid gap-8 lg:grid-cols-3 lg:gap-12">
              <div className={orderPlaced ? "lg:col-span-3 mx-auto w-full max-w-2xl min-w-0" : "lg:col-span-2 min-w-0"}>
                <CheckoutForm
                  user={user}
                  total={cartTotal}
                  onSuccess={() => {
                    setOrderPlaced(true)
                    void refreshCart() // the server cart was turned into orders
                  }}
                />
              </div>
              {!orderPlaced && (
                <div>
                  <CheckoutSummary items={cart} total={cartTotal} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  )
}
