import { Banknote } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PaymentMethod } from "@/lib/types"

// Plain wordmarks in each service's familiar colour, drawn here rather than copied from their logo
// files: enough to recognise the method at a glance. Fixed colours on purpose — a brand mark does
// not follow the site's light/dark theme.
const MARKS: Record<Exclude<PaymentMethod, "cash">, { text: string; className: string }> = {
  apple_pay: { text: "Apple Pay", className: "bg-black text-white tracking-tight" },
  google_pay: { text: "G Pay", className: "bg-white text-[#3c4043] ring-1 ring-inset ring-black/15" },
  click: { text: "click", className: "bg-[#00a1e4] text-white lowercase" },
  payme: { text: "payme", className: "bg-[#33cccc] text-[#0b3b3b] lowercase" },
  xazna: { text: "xazna", className: "bg-[#1f8a4c] text-white lowercase" },
}

/** A small badge that identifies a payment method (decorative: the method's name is always written next to it). */
export function PaymentMark({ method, size = "md", className }: {
  method: PaymentMethod | string
  size?: "md" | "lg"
  className?: string
}) {
  const box = size === "lg" ? "h-11 w-[5.5rem] text-base" : "h-8 w-16 text-[11px]"
  const mark = MARKS[method as keyof typeof MARKS]

  if (!mark) {
    return (
      <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground", box, className)}>
        <Banknote className={size === "lg" ? "h-6 w-6" : "h-4 w-4"} />
      </span>
    )
  }
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-lg font-bold leading-none", box, mark.className, className)}>
      {mark.text}
    </span>
  )
}
