"use client"

import Image from "next/image"
import Link from "next/link"
import { useMoney } from "@/lib/currency"
import type { CartItem } from "@/lib/store-context"

interface CheckoutSummaryProps {
  /** Server cart lines — prices and totals come from the backend. */
  items: CartItem[]
  total: number
}

export function CheckoutSummary({ items, total }: CheckoutSummaryProps) {
  const { format } = useMoney()
  return (
    <div className="sticky top-24 space-y-6">
      <div className="rounded-2xl bg-background border border-border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Buyurtma tarkibi</h2>
          <Link
            href="/cart"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            O'zgartirish
          </Link>
        </div>

        {/* Items */}
        <ul className="mt-6 space-y-4">
          {items.map((item) => (
            <li key={item.cartItemId} className="flex gap-4">
              <div className="relative h-16 w-16 flex-shrink-0">
                <div className="relative h-full w-full overflow-hidden rounded-lg bg-secondary">
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <span
                  className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-xs font-medium text-background"
                  aria-label={`${item.quantity} dona`}
                >
                  {item.quantity}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.name}</p>
                {item.variantLabel && (
                  <p className="text-xs text-muted-foreground">{item.variantLabel}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {item.quantity} × {format(item.price)}
                </p>
              </div>
              <p className="font-medium text-sm">{format(item.lineTotal)}</p>
            </li>
          ))}
        </ul>

        {/* Total: exactly the sum the server will charge — no client-side tax/shipping */}
        <div className="mt-6 border-t border-border pt-6">
          <div className="flex justify-between text-lg font-semibold">
            <span>Jami</span>
            <span>{format(total)}</span>
          </div>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Yordam kerakmi?{" "}
          <Link href="/contact" className="text-foreground underline">
            Biz bilan bog'laning
          </Link>
        </p>
      </div>
    </div>
  )
}
