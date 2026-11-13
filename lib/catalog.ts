// Catalog filters live in the URL (shareable, crawlable, back-button friendly) and are applied by
// the API. This module is the single place that reads and writes those URL parameters.
import { convertPrice, formatPrice, type Currency } from './utils'

export type CatalogSort = 'new' | 'price_asc' | 'price_desc' | 'discount'

export const CATALOG_SORTS: { value: CatalogSort; label: string }[] = [
  { value: 'new', label: 'Eng yangi' },
  { value: 'price_asc', label: 'Narx: arzon — qimmat' },
  { value: 'price_desc', label: 'Narx: qimmat — arzon' },
  { value: 'discount', label: 'Chegirmali avval' },
]

export interface CatalogFilters {
  q: string
  sort: CatalogSort
  inStock: boolean
  /** "min-max" tokens, either end may be empty: "0-500", "2000-" */
  priceRanges: string[]
  storages: string[]
  colors: string[]
  page: number
}

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
  q: '', sort: 'new', inStock: false, priceRanges: [], storages: [], colors: [], page: 1,
}

export const CATALOG_PAGE_SIZE = 24

type RawParams = Record<string, string | string[] | undefined>

const PRICE_TOKEN = /^\d{0,12}-\d{0,12}$/
const MAX_VALUES = 12

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function list(value: string | string[] | undefined, maxLength: number): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(values.map((v) => v.trim()).filter((v) => v && v.length <= maxLength))].slice(0, MAX_VALUES)
}

/** Anything unexpected in the URL is dropped, so a hand-edited link never produces an API error. */
export function parseCatalogParams(params: RawParams): CatalogFilters {
  const sort = first(params.sort)
  const page = Number.parseInt(first(params.page), 10)
  return {
    q: first(params.q).trim().slice(0, 100),
    sort: CATALOG_SORTS.some((s) => s.value === sort) ? (sort as CatalogSort) : 'new',
    inStock: first(params.stock) === '1',
    priceRanges: list(params.price, 25).filter((token) => PRICE_TOKEN.test(token) && token !== '-').slice(0, 6),
    storages: list(params.storage, 50),
    colors: list(params.color, 100),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 100000) : 1,
  }
}

/** URL for a filter state; defaults are left out so the plain listing keeps its clean URL. */
export function catalogHref(basePath: string, filters: CatalogFilters): string {
  const query = new URLSearchParams()
  if (filters.q) query.set('q', filters.q)
  if (filters.sort !== 'new') query.set('sort', filters.sort)
  if (filters.inStock) query.set('stock', '1')
  for (const token of filters.priceRanges) query.append('price', token)
  for (const storage of filters.storages) query.append('storage', storage)
  for (const color of filters.colors) query.append('color', color)
  if (filters.page > 1) query.set('page', String(filters.page))
  const text = query.toString()
  return text ? `${basePath}?${text}` : basePath
}

export function activeFilterCount(filters: CatalogFilters): number {
  return filters.priceRanges.length + filters.storages.length + filters.colors.length + (filters.inStock ? 1 : 0)
}

/**
 * Price bands offered in the filter panel, in the currency prices are entered in: the tokens go to
 * the API as they are, so a filtered URL means the same thing whatever currency the visitor looks at.
 */
export const PRICE_RANGES: Record<Currency, { token: string; label: string }[]> = {
  USD: [
    { token: '0-500', label: '$500 gacha' },
    { token: '500-1000', label: '$500 – $1,000' },
    { token: '1000-2000', label: '$1,000 – $2,000' },
    { token: '2000-', label: '$2,000 dan yuqori' },
  ],
  UZS: [
    { token: '0-5000000', label: "5 mln so'mgacha" },
    { token: '5000000-10000000', label: "5 – 10 mln so'm" },
    { token: '10000000-20000000', label: "10 – 20 mln so'm" },
    { token: '20000000-', label: "20 mln so'mdan yuqori" },
  ],
}

/** "6 mln", "11,9 mln", "850 ming" — how a so'm amount is said, not its exact digits. */
function soumShort(amount: number): { text: string; unit: string } {
  if (amount >= 1_000_000) return { text: String(Math.round(amount / 100_000) / 10).replace('.', ','), unit: ' mln' }
  if (amount >= 1_000) return { text: String(Math.round(amount / 1_000)), unit: ' ming' }
  return { text: String(Math.round(amount)), unit: '' }
}

/**
 * The same bands for a visitor who views prices in `display`. Only the labels are converted (and
 * rounded to what a person would say); the tokens — and so the products that match — do not change.
 */
export function priceRangeOptions(base: Currency, display: Currency, usdRate: number): { token: string; label: string }[] {
  if (base === display || !(usdRate > 0)) return PRICE_RANGES[base]
  return PRICE_RANGES[base].map(({ token }) => {
    const [from, to] = token.split('-')
    const low = Number(from) > 0 ? convertPrice(from, base, display, usdRate) : null
    const high = to ? convertPrice(to, base, display, usdRate) : null

    if (display === 'USD') {
      const text = (amount: number) => formatPrice(Math.round(amount), 'USD')
      if (low === null) return { token, label: `${text(high ?? 0)} gacha` }
      if (high === null) return { token, label: `${text(low)} dan yuqori` }
      return { token, label: `${text(low)} – ${text(high)}` }
    }

    const a = low === null ? null : soumShort(low)
    const b = high === null ? null : soumShort(high)
    if (a && b) return { token, label: `${a.text}${a.unit === b.unit ? '' : a.unit} – ${b.text}${b.unit} so'm` }
    if (b) return { token, label: `${b.text}${b.unit} so'mgacha` }
    return { token, label: `${a?.text ?? '0'}${a?.unit ?? ''} so'mdan yuqori` }
  })
}
