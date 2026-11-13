"use client"

import { useState } from "react"
import { FlaskConical, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PaymentMark } from "@/components/payment/payment-mark"
import { useMoney } from "@/lib/currency"
import type { PaymentOption } from "@/lib/payments"

/** long enough to read as "the payment is going through", short enough not to be a wait */
const PROCESSING_MS = 1200

interface Props {
  option: PaymentOption
  /** cart total, in the currency prices are entered in */
  total: number
  open: boolean
  onClose: () => void
  /** Places the order with this method. Resolves to an error message, or "" when it went through. */
  onPay: () => Promise<string>
}

/**
 * Stands in for the payment provider's own sheet while none is connected. It never asks for card
 * details and nothing is charged — and it says so, in the dialog and on everything that follows.
 */
export function DemoPaymentDialog({ option, total, open, onClose, onPay }: Props) {
  const { currency, format, formatIn } = useMoney()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")

  // these services charge in so'm, so that is the sum shown first
  const soum = formatIn(total, "UZS")
  const shown = format(total)

  async function pay() {
    if (processing) return
    setProcessing(true)
    setError("")
    await new Promise((done) => setTimeout(done, PROCESSING_MS))
    const problem = await onPay() // on success the checkout swaps to its success screen and this dialog goes away
    setProcessing(false)
    if (problem) setError(problem)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !processing) { setError(""); onClose() } }}>
      <DialogContent showCloseButton={false} className="max-w-sm gap-0 rounded-2xl p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <PaymentMark method={option.id} size="lg" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
            Demo rejim
          </span>
        </div>

        <div className="px-6 py-6">
          <DialogHeader className="text-left">
            <DialogTitle>{option.name} orqali to&apos;lov</DialogTitle>
            <DialogDescription>
              Bu to&apos;lov tizimi hali ulanmagan. Tugmani bossangiz, to&apos;lov namoyish tarzida
              «o&apos;tdi» deb belgilanadi.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 rounded-xl bg-secondary/60 p-4">
            <p className="text-xs text-muted-foreground">To&apos;lov summasi</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{soum ?? shown}</p>
            {soum && currency === "USD" && <p className="text-sm text-muted-foreground tabular-nums">{shown}</p>}
          </div>

          <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Haqiqiy pul yechilmaydi va karta ma&apos;lumotlari so&apos;ralmaydi.
          </p>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Button size="lg" className="w-full rounded-xl" onClick={() => void pay()} disabled={processing} aria-busy={processing}>
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {processing ? "To'lov amalga oshirilmoqda…" : "To'lash (demo)"}
            </Button>
            <Button variant="ghost" className="w-full rounded-xl" onClick={onClose} disabled={processing}>
              Bekor qilish
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
