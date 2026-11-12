import Link from "next/link"
import { ArrowRight, Banknote, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/utils"

interface CartSummaryProps {
  /** Sum of the cart lines (server-computed when logged in). */
  total: number
  isLoggedIn: boolean
}

/**
 * Shows exactly what will be charged: the sum of the cart lines.
 * No client-side promo codes, shipping fees or taxes — the backend has none of them.
 */
export function CartSummary({ total, isLoggedIn }: CartSummaryProps) {
  // Orders need an account; the guest cart is merged into the account cart after login.
  const checkoutHref = isLoggedIn ? "/checkout" : "/account?next=/checkout"

  return (
    <div className="sticky top-24 space-y-6">
      <div className="rounded-2xl bg-card border border-border p-6">
        <h2 className="text-lg font-semibold">Buyurtma xulosasi</h2>

        <div className="mt-6 space-y-3 border-t border-border pt-6">
          <div className="flex justify-between text-lg font-semibold">
            <span>Jami</span>
            <span>{formatPrice(total)}</span>
          </div>
          {!isLoggedIn && (
            <p className="text-xs text-muted-foreground">
              Yakuniy narx hisobga kirganingizdan so'ng server tomonidan tasdiqlanadi.
            </p>
          )}
        </div>

        <Button className="mt-6 w-full rounded-xl" size="lg" asChild>
          <Link href={checkoutHref}>
            {isLoggedIn ? "Buyurtma berish" : "Kirish va buyurtma berish"}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="rounded-2xl bg-secondary/50 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background">
            <Banknote className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium">Qabul qilganda to'lash</p>
            <p className="text-xs text-muted-foreground">Naqd pul yoki karta orqali</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background">
            <Truck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium">Yetkazib berish yoki olib ketish</p>
            <p className="text-xs text-muted-foreground">Usulni buyurtma berishda tanlaysiz</p>
          </div>
        </div>
      </div>

      <div className="text-center">
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Xaridni davom ettirish
        </Link>
      </div>
    </div>
  )
}
