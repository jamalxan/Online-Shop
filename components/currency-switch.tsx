"use client"

import { cn, type Currency } from "@/lib/utils"
import { useMoney } from "@/lib/currency"

const OPTIONS: { value: Currency; label: string; hint: string }[] = [
  { value: "UZS", label: "so'm", hint: "Narxlarni so'mda ko'rsatish" },
  { value: "USD", label: "$", hint: "Narxlarni dollarda ko'rsatish" },
]

/**
 * Lets the visitor choose the currency prices are shown in. The choice is remembered in their
 * browser. Renders nothing when the shop has no exchange rate — there is nothing to switch to.
 */
export function CurrencySwitch({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  const { currency, canSwitch, setCurrency } = useMoney()
  if (!canSwitch) return null

  return (
    <div
      role="group"
      aria-label="Narxlar valyutasi"
      className={cn("inline-flex shrink-0 items-center rounded-full border border-border bg-background/70 p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, hint }) => (
        <button
          key={value}
          type="button"
          aria-pressed={currency === value}
          aria-label={hint}
          title={hint}
          onClick={() => setCurrency(value)}
          className={cn(
            "rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            size === "lg" ? "min-h-11 min-w-16 px-4 text-sm" : "min-h-8 min-w-8 px-2.5 text-xs",
            currency === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
