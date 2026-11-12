"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Check, Truck, Package, ChevronRight, CheckCircle, ShoppingBag, Banknote, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, formatPrice, toNumber } from "@/lib/utils"
import { createOrder } from "@/lib/api"
import type { ApiOrder, DeliveryMethod, UserProfile } from "@/lib/types"

type StepId = "contact" | "delivery" | "confirm"

const steps: { id: StepId; name: string; icon: typeof Package }[] = [
  { id: "contact", name: "Aloqa", icon: Package },
  { id: "delivery", name: "Yetkazib berish", icon: Truck },
  { id: "confirm", name: "Tasdiqlash", icon: Banknote },
]

// No prices or dates here on purpose: the backend defines neither.
const deliveryMethods: { id: DeliveryMethod; name: string; description: string }[] = [
  { id: "standard", name: "Standart yetkazib berish", description: "Kuryer ko'rsatilgan manzilga yetkazadi" },
  { id: "express", name: "Tezkor yetkazib berish", description: "Kuryer orqali, ustuvor tartibda" },
  { id: "pickup", name: "Do'kondan olib ketish", description: "Buyurtmani o'zingiz olib ketasiz" },
]

const PHONE_PATTERN = /^\+?\d{9,15}$/

interface CheckoutFormProps {
  user: UserProfile | null
  onSuccess?: (orders: ApiOrder[]) => void
}

export function CheckoutForm({ user, onSuccess }: CheckoutFormProps) {
  const [currentStep, setCurrentStep] = useState<StepId>("contact")
  const [completedSteps, setCompletedSteps] = useState<StepId[]>([])
  const [delivery, setDelivery] = useState<DeliveryMethod>("standard")
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")
  const [orders, setOrders] = useState<ApiOrder[] | null>(null)
  // Synchronous guard: state updates are async, a ref blocks a second click immediately.
  const submittingRef = useRef(false)

  const [form, setForm] = useState({
    first_name: user?.first_name ?? "",
    phone_number: user?.phone_number ?? "",
    address: "",
    comment: "",
  })

  const phone = form.phone_number.replace(/[\s()-]/g, "")
  const needsAddress = delivery !== "pickup"

  function validateContact(): string {
    if (!form.first_name.trim()) return "Ismingizni kiriting"
    if (!PHONE_PATTERN.test(phone)) return "Telefon raqamni to'g'ri kiriting (masalan: +998901234567)"
    return ""
  }

  function validateDelivery(): string {
    if (needsAddress && form.address.trim().length < 5) return "Yetkazib berish manzilini kiriting"
    return ""
  }

  function goTo(step: StepId) {
    // a later step can only be opened once the earlier ones are valid
    const targetIndex = steps.findIndex((s) => s.id === step)
    const problem = (targetIndex > 0 && validateContact()) || (targetIndex > 1 && validateDelivery()) || ""
    if (problem) {
      setError(problem)
      setCurrentStep(validateContact() ? "contact" : "delivery")
      return
    }
    setError("")
    setCurrentStep(step)
  }

  function completeStep(step: StepId) {
    const problem = step === "contact" ? validateContact() : step === "delivery" ? validateDelivery() : ""
    if (problem) { setError(problem); return }
    setError("")
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]))
    const index = steps.findIndex((s) => s.id === step)
    if (index < steps.length - 1) setCurrentStep(steps[index + 1].id)
  }

  async function handlePlaceOrder() {
    if (submittingRef.current) return
    const problem = validateContact() || validateDelivery()
    if (problem) { setError(problem); return }

    submittingRef.current = true
    setError("")
    setIsProcessing(true)
    const res = await createOrder({
      first_name: form.first_name.trim(),
      phone_number: phone,
      delivery_method: delivery,
      ...(needsAddress ? { address: form.address.trim() } : {}),
      ...(form.comment.trim() ? { comment: form.comment.trim() } : {}),
      from_cart: true,
    })
    setIsProcessing(false)
    if (!res.ok) {
      submittingRef.current = false // allow a retry after a failure
      setError(res.error)
      return
    }
    // keep the guard set: this checkout is done
    setOrders(res.data)
    onSuccess?.(res.data)
  }

  // ── Success screen: real order numbers and server-computed totals ──
  if (orders) {
    const total = orders.reduce((sum, o) => sum + toNumber(o.total_price), 0)
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
                  <span className="font-medium shrink-0">{formatPrice(order.total_price)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
              <span>Jami</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-border p-4 text-left">
          <Banknote className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">To'lov — qabul qilganda</p>
            <p className="text-sm text-muted-foreground">Naqd pul yoki karta orqali.</p>
          </div>
        </div>

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
      <ol className="flex items-center gap-4 overflow-x-auto pb-4">
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
              {index < steps.length - 1 && <ChevronRight className="mx-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />}
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
                <label
                  key={method.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    delivery === method.id ? "border-foreground bg-secondary/50" : "border-border hover:border-foreground/50"
                  )}
                >
                  <input
                    type="radio" name="delivery" value={method.id}
                    checked={delivery === method.id}
                    onChange={() => setDelivery(method.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn("h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0", delivery === method.id ? "border-foreground" : "border-border")}
                  >
                    {delivery === method.id && <span className="h-2.5 w-2.5 rounded-full bg-foreground" />}
                  </span>
                  <span>
                    <span className="block font-medium">{method.name}</span>
                    <span className="block text-sm text-muted-foreground">{method.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {needsAddress && (
            <div className="mt-6">
              <label htmlFor="checkout-address" className="text-sm font-medium">Manzil *</label>
              <textarea
                id="checkout-address"
                required rows={2} maxLength={300} autoComplete="street-address"
                value={form.address}
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                className={cn(inputClass, "resize-none")}
                placeholder="Shahar, tuman, ko'cha, uy"
              />
            </div>
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
            Tasdiqlashga o'tish <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      )}

      {/* Confirm — payment happens on delivery; no card data is collected on this site */}
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
                <dd className="text-right font-medium break-words max-w-[70%]">{form.address.trim()}</dd>
              </div>
            )}
          </dl>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-secondary/50 p-4">
            <Banknote className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">To'lov — qabul qilganda</p>
              <p className="text-sm text-muted-foreground">
                Naqd pul yoki karta orqali kuryerga (yoki do'konda) to'laysiz. Saytda karta ma'lumotlari so'ralmaydi.
              </p>
            </div>
          </div>

          <Button
            className="mt-6 w-full rounded-xl" size="lg"
            onClick={handlePlaceOrder}
            disabled={isProcessing}
            aria-busy={isProcessing}
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isProcessing ? "Buyurtma joylashtirilmoqda..." : "Buyurtmani tasdiqlash"}
          </Button>
        </div>
      )}
    </div>
  )
}
