"use client"

import { useMemo, useSyncExternalStore } from "react"
import { useStore } from "./store-context"
import { convertPrice, formatPrice, resolvePriceView, type Currency } from "./utils"

// The visitor's own choice of currency. It lives in the browser only: the server renders every page
// in the shop's default (pages are cached and shared), and the choice is applied right after hydration.
const STORAGE_KEY = "display_currency"
const listeners = new Set<() => void>()
/** used when localStorage is blocked: the choice then lasts until the page is reloaded */
let memoryChoice: Currency | null = null

function readChoice(): Currency | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "USD" || saved === "UZS") return saved
  } catch {
    // storage blocked — fall through to the in-memory value
  }
  return memoryChoice
}

function saveChoice(currency: Currency) {
  memoryChoice = currency
  try {
    localStorage.setItem(STORAGE_KEY, currency)
  } catch {
    // storage full / blocked — the choice simply won't survive a reload
  }
  listeners.forEach((notify) => notify())
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener("storage", onChange) // changed in another tab
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

const noChoice = () => null

type Amount = string | number | null | undefined

/**
 * Prices as this visitor sees them. Every amount from the API is in the currency the shop enters
 * prices in; `format` converts it into the currency the visitor picked (or the shop's default).
 *
 * `orderRate` is the exchange rate saved on an order: an order keeps showing the sum the customer
 * agreed to, whatever the rate is today. Leave it out for catalogue and cart prices.
 */
export function useMoney() {
  const { store } = useStore()
  const choice = useSyncExternalStore(subscribe, readChoice, noChoice)

  return useMemo(() => {
    const { base, currency, rate } = resolvePriceView(store, choice)
    const rateFor = (orderRate?: number | null) => (orderRate && orderRate > 0 ? orderRate : rate)
    return {
      /** currency the API's amounts are in */
      base,
      /** currency prices are shown in */
      currency,
      /** so'm per dollar; 0 when the shop has no rate (then nothing is converted) */
      rate,
      /** false when there is nothing to switch between */
      canSwitch: rate > 0,
      setCurrency: saveChoice,
      format: (value: Amount, orderRate?: number | null) =>
        formatPrice(convertPrice(value, base, currency, rateFor(orderRate)), currency),
      /** The same amount in a specific currency; null when it cannot be converted. */
      formatIn: (value: Amount, target: Currency, orderRate?: number | null) =>
        target === base || rateFor(orderRate) > 0
          ? formatPrice(convertPrice(value, base, target, rateFor(orderRate)), target)
          : null,
    }
  }, [store, choice])
}
