import type { PaymentMethod } from "./types"

export interface PaymentOption {
  id: PaymentMethod
  name: string
  description: string
}

/** Paid to the courier (or in the shop) when the order is handed over. Always available. */
export const CASH_OPTION: PaymentOption = {
  id: "cash",
  name: "Qabul qilganda to'lash",
  description: "Naqd pul yoki karta bilan — kuryerga yoki do'konda",
}

/**
 * Online methods. None of them is connected to a real payment provider yet: the server accepts
 * them only in demo mode (`store.demo_payments`), takes no money and marks the payment as a demo.
 */
export const ONLINE_OPTIONS: PaymentOption[] = [
  { id: "apple_pay", name: "Apple Pay", description: "iPhone, iPad yoki Mac orqali" },
  { id: "google_pay", name: "Google Pay", description: "Android qurilma yoki Chrome orqali" },
  { id: "click", name: "Click", description: "Click ilovasi yoki Click hamyoni orqali" },
  { id: "payme", name: "Payme", description: "Payme ilovasi orqali" },
  { id: "xazna", name: "Xazna", description: "Xazna ilovasi orqali" },
]

const NAMES: Record<string, string> = Object.fromEntries(
  [CASH_OPTION, ...ONLINE_OPTIONS].map((option) => [option.id, option.name]),
)

export function paymentMethodName(method: string | null | undefined): string {
  return (method && NAMES[method]) || CASH_OPTION.name
}

export function isOnlinePayment(method: string | null | undefined): boolean {
  return Boolean(method) && method !== "cash"
}
