"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import {
  Banknote, Check, CheckCircle, ChevronRight, ClipboardCheck, FlaskConical, Loader2, Package, ShoppingBag, Truck, Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoPaymentDialog } from "@/components/checkout/demo-payment-dialog"
import { PaymentMark } from "@/components/payment/payment-mark"
import { cn, toNumber } from "@/lib/utils"
import { useMoney } from "@/lib/currency"
import { useStore } from "@/lib/store-context"
import { createOrder } from "@/lib/api"
import { CASH_OPTION, ONLINE_OPTIONS, isOnlinePayment, paymentMethodName } from "@/lib/payments"
import type { ApiOrder, DeliveryMethod, PaymentMethod, UserProfile } from "@/lib/types"

type StepId = "contact" | "delivery" | "payment" | "confirm"

const steps: { id: StepId; name: string; icon: typeof Package }[] = [
  { id: "contact", name: "Aloqa", icon: Package },
  { id: "delivery", name: "Yetkazib berish", icon: Truck },
  { id: "payment", name: "To'lov", icon: Wallet },
  { id: "confirm", name: "Tasdiqlash", icon: ClipboardCheck },
]

// No prices or dates here on purpose: the backend defines neither.
const deliveryMethods: { id: DeliveryMethod; name: string; description: string }[] = [
  { id: "standard", name: "Standart yetkazib berish", description: "Kuryer ko'rsatilgan manzilga yetkazadi" },
  { id: "express", name: "Tezkor yetkazib berish", description: "Kuryer orqali, ustuvor tartibda" },
  { id: "pickup", name: "Do'kondan olib ketish", description: "Buyurtmani o'zingiz olib ketasiz" },
]

const REGIONS = [
  "Toshkent shahri", "Toshkent viloyati", "Andijon viloyati", "Buxoro viloyati", "Farg'ona viloyati",
  "Jizzax viloyati", "Namangan viloyati", "Navoiy viloyati", "Qashqadaryo viloyati",
  "Qoraqalpog'iston Respublikasi", "Samarqand viloyati", "Sirdaryo viloyati", "Surxondaryo viloyati",
  "Xorazm viloyati",
]

const PHONE_PATTERN = /^\+?\d{9,15}$/

interface CheckoutFormProps {
  user: UserProfile | null
  /** cart total, in the currency prices are entered in (what an online payment is asked for) */
  total: number
  onSuccess?: (orders: ApiOrder[]) => void
}

/** Radio card shared by the delivery and payment choices. */
function ChoiceCard({ name, checked, onSelect, children }: {
  name: string
  checked: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked ? "border-foreground bg-secondary/50" : "border-border hover:border-foreground/50"
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn("h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0", checked ? "border-foreground" : "border-border")}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-foreground" />}
      </span>
      {children}
    </label>
  )
}

function DemoTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900", className)}>
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      Demo
    </span>
  )
}

export function CheckoutForm({ user, total, onSuccess }: CheckoutFormProps) {
  const { format } = useMoney()
  const { store } = useStore()
  const [currentStep, setCurrentStep] = useState<StepId>("contact")
  const [completedSteps, setCompletedSteps] = useState<StepId[]>([])
  const [delivery, setDelivery] = useState<DeliveryMethod>("standard")
  const [payment, setPayment] = useState<PaymentMethod>("cash")
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")
  const [orders, setOrders] = useState<ApiOrder[] | null>(null)
  // Synchronous guard: state updates are async, a ref blocks a second click immediately.
  const submittingRef = useRef(false)

  const [form, setForm] = useState({
    first_name: user?.first_name ?? "",
    phone_number: user?.phone_number ?? "",
    region: "",
    district: "",
    street: "",
    landmark: "",
    comment: "",
  })

  const phone = form.phone_number.replace(/[\s()-]/g, "")
  const needsAddress = delivery !== "pickup"
  // One line for the courier: the backend stores the address as text.
  const address = [form.region, form.district.trim(), form.street.trim()].filter(Boolean).join(", ")
    + (form.landmark.trim() ? ` (mo'ljal: ${form.landmark.trim()})` : "")

  // Online methods exist only while the server runs them as a demo; otherwise it is cash on delivery.
  const onlineOptions = store.demo_payments ? ONLINE_OPTIONS : []
  const paymentOption = onlineOptions.find((option) => option.id === payment) ?? CASH_OPTION
  const payOnline = paymentOption.id !== "cash"

  function validateContact(): string {
    if (!form.first_name.trim()) return "Ismingizni kiriting"
    if (!PHONE_PATTERN.test(phone)) return "Telefon raqamni to'g'ri kiriting (masalan: +998901234567)"
    return ""
  }

  function validateDelivery(): string {
    if (!needsAddress) return ""
    if (!form.region) return "Viloyat yoki shaharni tanlang"
    if (form.district.trim().length < 2) return "Tuman yoki shaharni kiriting"
    if (form.street.trim().length < 3) return "Ko'cha va uy raqamini kiriting"
    return ""
  }

  /** the first problem in the steps before `index`, and the step it belongs to */
  function problemBefore(index: number): { message: string; step: StepId } | null {
    const contact = index > 0 ? validateContact() : ""
    if (contact) return { message: contact, step: "contact" }
    const deliveryProblem = index > 1 ? validateDelivery() : ""
    if (deliveryProblem) return { message: deliveryProblem, step: "delivery" }
    return null
  }

  function goTo(step: StepId) {
    // a later step can only be opened once the earlier ones are valid
    const problem = problemBefore(steps.findIndex((s) => s.id === step))
    if (problem) {
      setError(problem.message)
      setCurrentStep(problem.step)
      return
    }
    setError("")
    setCurrentStep(step)
  }

  function completeStep(step: StepId) {
    const index = steps.findIndex((s) => s.id === step)
    const problem = problemBefore(index + 1)
    if (problem) { setError(problem.message); setCurrentStep(problem.step); return }
    setError("")
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]))
    if (index < steps.length - 1) setCurrentStep(steps[index + 1].id)
  }

  /** Creates the order(s). Returns an error message, or "" when the order went through. */
  async function placeOrder(): Promise<string> {
    if (submittingRef.current) return ""
    submittingRef.current = true
    setIsProcessing(true)
    const res = await createOrder({
      first_name: form.first_name.trim(),
      phone_number: phone,
      delivery_method: delivery,
      payment_method: paymentOption.id,
      ...(needsAddress ? { address } : {}),
      ...(form.comment.trim() ? { comment: form.comment.trim() } : {}),
      from_cart: true,
    })
    setIsProcessing(false)
    if (!res.ok) {
      submittingRef.current = false // allow a retry after a failure
      return res.error
    }
    // keep the guard set: this checkout is done
    setPayDialogOpen(false)
    setOrders(res.data)
    onSuccess?.(res.data)
    return ""
  }

  async function handleConfirm() {
    const problem = problemBefore(steps.length)
    if (problem) { setError(problem.message); setCurrentStep(problem.step); return }
    setError("")
    if (payOnline) {
      setPayDialogOpen(true) // the order is placed from the payment dialog
      return
    }
    const failure = await placeOrder()
    if (failure) setError(failure)
  }

  // ── Success screen: real order numbers and server-computed totals ──
  if (orders) {
    const orderTotal = orders.reduce((sum, o) => sum + toNumber(o.total_price), 0)
    const paidWith = orders[0]?.payment_method
    const paidOnline = isOnlinePayment(paidWith) && orders[0]?.payment_status === "complete"
    return (
      <div className="rounded-2xl bg-background border border-border p-8 text-center" role="status">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-10 w-10 text-green-600" aria-hidden="true" />
        </div>
        <h2 className="mt-6 font-serif text-2xl sm:text-3xl">Buyurtma qabul qilindi!</h2>
        <p className="mt-2 text-muted-foreground">
          Buyurtma holatini «Buyurtmalarim» bo'limida kuzatishingiz mumkin.
        </p>

        {orders.length > 0 && (
          <div className="mt-6 rounded-xl bg-secondary/50 p-4 text-left">
            <p className="text-sm text-muted-foreground">
              {orders.length > 1 ? "Buyurtma raqamlari" : "Buyurtma raqami"}
            </p>
            <ul className="mt-2 space-y-2">
              {orders.map((order) => (
                <li key={order.id} className="flex items-start justify-between gap-4 text-sm">
                  <span>
                    <span className="font-semibold">#{order.id}</span>{" "}
                    {order.product?.title} × {order.quantity}
                    {(order.storage_label || order.color_name) && (
                      <span className="text-muted-foreground">
                        {" "}({[order.storage_label, order.color_name].filter(Boolean).join(" · ")})
                      </span>
                    )}
                  </span>
                  <span className="font-medium shrink-0">{format(order.total_price, order.usd_rate)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
              <span>Jami</span>
              <span>{format(orderTotal, orders[0]?.usd_rate)}</span>
            </div>
          </div>
        )}

        {paidOnline ? (
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-border p-4 text-left">
            <PaymentMark method={paidWith ?? ""} />
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {paymentMethodName(paidWith)} orqali to'landi
                {orders[0]?.payment_demo && <DemoTag />}
              </p>
              {orders[0]?.payment_demo && (
                <p className="text-sm text-muted-foreground">Demo to'lov: haqiqiy pul yechilmadi.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-border p-4 text-left">
            <Banknote className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">To'lov — qabul qilganda</p>
              <p className="text-sm text-muted-foreground">Naqd pul yoki karta orqali.</p>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="outline" className="flex-1 rounded-xl">
            <Link href="/products"><ShoppingBag className="mr-2 h-4 w-4" aria-hidden="true" />Xaridni davom ettirish</Link>
          </Button>
          <Button asChild className="flex-1 rounded-xl">
            <Link href="/account/orders">Buyurtmalarim</Link>
          </Button>
        </div>
      </div>
    )
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <ol className="flex items-center gap-2 overflow-x-auto pb-4 sm:gap-4">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id)
          const isCurrent = currentStep === step.id
          return (
            <li key={step.id} className="flex items-center">
              <button
                type="button"
                onClick={() => goTo(step.id)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-full px-4 py-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCurrent ? "bg-foreground text-background" : isCompleted ? "bg-secondary text-foreground" : "text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="text-sm font-medium">{index + 1}</span>}
                <span className="text-sm font-medium">{step.name}</span>
              </button>
              {index < steps.length - 1 && <ChevronRight className="mx-1 h-4 w-4 shrink-0 text-muted-foreground sm:mx-2" aria-hidden="true" />}
            </li>
          )
        })}
      </ol>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Contact */}
      {currentStep === "contact" && (
        <form
          className="rounded-2xl bg-background border border-border p-6"
          onSubmit={(e) => { e.preventDefault(); completeStep("contact") }}
          noValidate
        >
          <h2 className="text-lg font-semibold">Aloqa ma'lumotlari</h2>
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="checkout-name" className="text-sm font-medium">Ism *</label>
              <input
                id="checkout-name"
                type="text" required autoComplete="given-name" maxLength={100}
                value={form.first_name}
                onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))}
                className={inputClass}
                placeholder="Ism"
              />
            </div>
            <div>
              <label htmlFor="checkout-phone" className="text-sm font-medium">Telefon raqam *</label>
              <input
                id="checkout-phone"
                type="tel" required autoComplete="tel" inputMode="tel" maxLength={20}
                value={form.phone_number}
                onChange={(e) => setForm(f => ({ ...f, phone_number: e.target.value }))}
                className={inputClass}
                placeholder="+998901234567"
              />
            </div>
          </div>
          <Button type="submit" className="mt-6 w-full rounded-xl" size="lg">
            Yetkazib berishga o'tish <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      )}

      {/* Delivery */}
      {currentStep === "delivery" && (
        <form
          className="rounded-2xl bg-background border border-border p-6"
          onSubmit={(e) => { e.preventDefault(); completeStep("delivery") }}
          noValidate
        >
          <fieldset>
            <legend className="text-lg font-semibold">Yetkazib berish usuli</legend>
            <div className="mt-4 space-y-3">
              {deliveryMethods.map((method) => (
                <ChoiceCard key={method.id} name="delivery" checked={delivery === method.id} onSelect={() => setDelivery(method.id)}>
                  <span>
                    <span className="block font-medium">{method.name}</span>
                    <span className="block text-sm text-muted-foreground">{method.description}</span>
                  </span>
                </ChoiceCard>
              ))}
            </div>
          </fieldset>

          {needsAddress && (
            <fieldset className="mt-8">
              <legend className="text-lg font-semibold">Yetkazib berish manzili</legend>
              <p className="mt-1 text-sm text-muted-foreground">Kuryer buyurtmani shu manzilga olib boradi.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="checkout-region" className="text-sm font-medium">Viloyat / shahar *</label>
                  <select
                    id="checkout-region"
                    required autoComplete="address-level1"
                    value={form.region}
                    onChange={(e) => setForm(f => ({ ...f, region: e.target.value }))}
                    className={cn(inputClass, !form.region && "text-muted-foreground")}
                  >
                    <option value="" disabled>Tanlang</option>
                    {REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="checkout-district" className="text-sm font-medium">Tuman / shahar *</label>
                  <input
                    id="checkout-district"
                    type="text" required maxLength={80} autoComplete="address-level2"
                    value={form.district}
                    onChange={(e) => setForm(f => ({ ...f, district: e.target.value }))}
                    className={inputClass}
                    placeholder="Masalan: Chilonzor tumani"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="checkout-street" className="text-sm font-medium">Ko'cha, uy, xonadon *</label>
                  <input
                    id="checkout-street"
                    type="text" required maxLength={150} autoComplete="street-address"
                    value={form.street}
                    onChange={(e) => setForm(f => ({ ...f, street: e.target.value }))}
                    className={inputClass}
                    placeholder="Masalan: Bunyodkor ko'chasi, 12-uy, 45-xonadon"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="checkout-landmark" className="text-sm font-medium">Mo'ljal (ixtiyoriy)</label>
                  <input
                    id="checkout-landmark"
                    type="text" maxLength={100}
                    value={form.landmark}
                    onChange={(e) => setForm(f => ({ ...f, landmark: e.target.value }))}
                    className={inputClass}
                    placeholder="Masalan: metro bekati yonida"
                  />
                </div>
              </div>
            </fieldset>
          )}

          <div className="mt-4">
            <label htmlFor="checkout-comment" className="text-sm font-medium">Izoh (ixtiyoriy)</label>
            <textarea
              id="checkout-comment"
              rows={2} maxLength={500}
              value={form.comment}
              onChange={(e) => setForm(f => ({ ...f, comment: e.target.value }))}
              className={cn(inputClass, "resize-none")}
              placeholder="Kuryer uchun qo'shimcha ma'lumot"
            />
          </div>

          <Button type="submit" className="mt-6 w-full rounded-xl" size="lg">
            To'lovga o'tish <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      )}

      {/* Payment */}
      {currentStep === "payment" && (
        <form
          className="rounded-2xl bg-background border border-border p-6"
          onSubmit={(e) => { e.preventDefault(); completeStep("payment") }}
          noValidate
        >
          <fieldset>
            <legend className="text-lg font-semibold">To'lov usuli</legend>
            <div className="mt-4 space-y-3">
              <ChoiceCard name="payment" checked={!payOnline} onSelect={() => setPayment("cash")}>
                <PaymentMark method="cash" />
                <span>
                  <span className="block font-medium">{CASH_OPTION.name}</span>
                  <span className="block text-sm text-muted-foreground">{CASH_OPTION.description}</span>
                </span>
              </ChoiceCard>

              {onlineOptions.length > 0 && (
                <p className="flex flex-wrap items-center gap-2 pt-3 text-sm font-medium">
                  Onlayn to'lov
                  <DemoTag />
                  <span className="font-normal text-muted-foreground">— hozircha sinov rejimida: pul yechilmaydi</span>
                </p>
              )}
              {onlineOptions.map((option) => (
                <ChoiceCard key={option.id} name="payment" checked={paymentOption.id === option.id} onSelect={() => setPayment(option.id)}>
                  <PaymentMark method={option.id} />
                  <span>
                    <span className="block font-medium">{option.name}</span>
                    <span className="block text-sm text-muted-foreground">{option.description}</span>
                  </span>
                </ChoiceCard>
              ))}
            </div>
          </fieldset>

          <Button type="submit" className="mt-6 w-full rounded-xl" size="lg">
            Tasdiqlashga o'tish <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      )}

      {/* Confirm */}
      {currentStep === "confirm" && (
        <div className="rounded-2xl bg-background border border-border p-6">
          <h2 className="text-lg font-semibold">Buyurtmani tasdiqlash</h2>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Qabul qiluvchi</dt>
              <dd className="text-right font-medium">{form.first_name.trim()}, {phone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Usul</dt>
              <dd className="text-right font-medium">{deliveryMethods.find((m) => m.id === delivery)?.name}</dd>
            </div>
            {needsAddress && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Manzil</dt>
                <dd className="text-right font-medium break-words max-w-[70%]">{address}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">To'lov</dt>
              <dd className="flex flex-wrap items-center justify-end gap-2 text-right font-medium">
                {paymentOption.name}
                {payOnline && <DemoTag />}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-secondary/50 p-4">
            <PaymentMark method={paymentOption.id} />
            {payOnline ? (
              <div>
                <p className="font-medium">{paymentOption.name} orqali to'lov</p>
                <p className="text-sm text-muted-foreground">
                  Demo rejim: to'lov oynasi ochiladi, lekin haqiqiy pul yechilmaydi va karta ma'lumotlari so'ralmaydi.
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium">To'lov — qabul qilganda</p>
                <p className="text-sm text-muted-foreground">
                  Naqd pul yoki karta orqali kuryerga (yoki do'konda) to'laysiz. Saytda karta ma'lumotlari so'ralmaydi.
                </p>
              </div>
            )}
          </div>

          <Button
            className="mt-6 w-full rounded-xl" size="lg"
            onClick={() => void handleConfirm()}
            disabled={isProcessing}
            aria-busy={isProcessing}
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isProcessing
              ? "Buyurtma joylashtirilmoqda..."
              : payOnline ? `To'lash — ${format(total)}` : "Buyurtmani tasdiqlash"}
          </Button>
        </div>
      )}

      {payOnline && (
        <DemoPaymentDialog
          option={paymentOption}
          total={total}
          open={payDialogOpen}
          onClose={() => setPayDialogOpen(false)}
          onPay={placeOrder}
        />
      )}
    </div>
  )
}
