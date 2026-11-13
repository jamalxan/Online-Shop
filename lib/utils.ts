import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** API money values are decimal strings — parse them safely (invalid → 0). */
export function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

const wholeFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const centsFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type Currency = 'USD' | 'UZS'

export function toCurrency(value: unknown): Currency {
  return value === 'UZS' ? 'UZS' : 'USD'
}

// The currency prices are ENTERED in (Admin → Sozlamalar) — the unit of every amount the API returns.
// The admin panel types and reads prices in it, through formatPrice()'s default. StoreProvider sets
// it (during SSR and in the browser) before any of its children render; it is a single shop-wide
// value, so sharing it between requests on the server is safe.
// The storefront does not use it: what a visitor sees is converted into the currency they picked
// (lib/currency.ts → useMoney).
let activeCurrency: Currency = 'USD'
let pinned = false

/** From server-rendered store info, which may be up to a minute old (page cache). */
export function setActiveCurrency(currency: unknown) {
  if (!pinned) activeCurrency = toCurrency(currency)
}

/**
 * From a fresh read of the setting (the admin panel, or the settings form after saving). It wins
 * over cached store info for the rest of this page session, so a late or stale server payload can
 * never flip the unit an admin is typing prices in. Browser only.
 */
export function pinActiveCurrency(currency: unknown) {
  if (typeof window === 'undefined') return
  activeCurrency = toCurrency(currency)
  pinned = true
}

export function getActiveCurrency(): Currency {
  return activeCurrency
}

const NBSP = '\u00A0'

/**
 * USD: "$1,099" for whole amounts, "$989.10" otherwise. UZS: "13 500 000 so'm" (no tiyin).
 * Fixed formatting so server and client render the same string (no hydration mismatch);
 * non-breaking spaces keep a so'm amount on one line.
 */
export function formatPrice(value: string | number | null | undefined, currency: Currency = activeCurrency): string {
  if (currency === 'UZS') {
    return `${wholeFormatter.format(Math.round(toNumber(value))).replace(/,/g, NBSP)}${NBSP}so'm`
  }
  const amount = Math.round(toNumber(value) * 100) / 100
  return `$${(Number.isInteger(amount) ? wholeFormatter : centsFormatter).format(amount)}`
}

/**
 * Converts between the two currencies at `usdRate` so'm per dollar. Without a usable rate the
 * amount comes back as it is — callers then show it in the currency it was entered in.
 */
export function convertPrice(
  value: string | number | null | undefined, from: Currency, to: Currency, usdRate: number,
): number {
  const amount = toNumber(value)
  if (from === to || !(usdRate > 0)) return amount
  return from === 'USD' ? amount * usdRate : amount / usdRate
}

/** The part of the shop settings that decides how a price is shown. */
export interface PriceSettings {
  /** currency prices are entered in */
  currency: string
  /** so'm per US dollar; 0 / missing = unknown, nothing is converted */
  usd_rate?: number | string | null
  /** what a visitor sees until they choose for themselves */
  display_currency?: string | null
}

export interface PriceView {
  /** currency the amounts from the API are in */
  base: Currency
  /** currency they are shown in */
  currency: Currency
  /** so'm per dollar (0 = no conversion possible) */
  rate: number
}

/** `choice` is the visitor's own pick, if they made one. Without a rate everything stays in `base`. */
export function resolvePriceView(store: PriceSettings, choice?: Currency | null): PriceView {
  const base = toCurrency(store.currency)
  const rate = toNumber(store.usd_rate)
  if (!(rate > 0)) return { base, currency: base, rate: 0 }
  const fallback = store.display_currency ? toCurrency(store.display_currency) : base
  return { base, currency: choice ?? fallback, rate }
}

/** A price as the shop shows it by default — for server components and metadata, where no visitor choice exists. */
export function formatStorePrice(value: string | number | null | undefined, store: PriceSettings): string {
  const { base, currency, rate } = resolvePriceView(store)
  return formatPrice(convertPrice(value, base, currency, rate), currency)
}

/**
 * The amount and its unit separately, for large display numbers: a so'm total is long, so the unit
 * is set smaller next to it instead of making the whole figure overflow its card.
 */
export function priceParts(
  value: string | number | null | undefined, currency: Currency = activeCurrency,
): { amount: string; unit: string } {
  const text = formatPrice(value, currency)
  return currency === 'UZS'
    ? { amount: text.slice(0, text.lastIndexOf(NBSP)), unit: "so'm" }
    : { amount: text, unit: '' }
}

/** Short unit shown next to a price input: "$" or "so'm". */
export function currencyUnit(currency: Currency = activeCurrency): string {
  return currency === 'UZS' ? "so'm" : '$'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** dd.mm.yyyy — formatted by hand so it never depends on the runtime's locale data. */
export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const day = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day
}

/** Colours come from the API — only plain hex values are ever put into a style attribute. */
export function safeHex(value: string | null | undefined, fallback = '#cccccc'): string {
  const hex = value?.trim() ?? ''
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex) ? hex : fallback
}

/** True for light swatches that need a visible border / dark check mark. */
export function isLightHex(value: string): boolean {
  const hex = safeHex(value).slice(1)
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6)
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 200
}
