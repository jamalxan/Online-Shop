"use client"

import { useMemo, useState } from "react"
import { ChevronDown, X, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, isLightHex, safeHex } from "@/lib/utils"

export interface FilterState {
  /** "min-max" tokens (see lib/catalog.ts) */
  priceRanges: string[]
  storages: string[]
  colors: string[]
  inStock: boolean
}

export const EMPTY_FILTERS: FilterState = { priceRanges: [], storages: [], colors: [], inStock: false }

const STORAGE_ORDER = ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"]

interface ProductFiltersProps {
  /** options that exist in this category / search — they come from the API, not from the visible page */
  storages: string[]
  colors: { name: string; hex: string }[]
  priceRanges: { token: string; label: string }[]
  filters: FilterState
  onChange: (filters: FilterState) => void
}

export function ProductFilters({ storages, colors: availableColors, priceRanges: priceOptions, filters, onChange }: ProductFiltersProps) {
  const [openSections, setOpenSections] = useState<string[]>(["price", "storage", "color"])
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const availableStorages = useMemo(() => {
    return [...storages].sort((a, b) => {
      const ai = STORAGE_ORDER.indexOf(a)
      const bi = STORAGE_ORDER.indexOf(b)
      if (ai !== -1 && bi !== -1) return ai - bi
      return a.localeCompare(b)
    })
  }, [storages])

  const priceRanges = priceOptions.map(({ token, label }) => ({ value: token, label }))

  const toggleSection = (id: string) => {
    setOpenSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  const togglePrice = (value: string) => {
    onChange({
      ...filters,
      priceRanges: filters.priceRanges.includes(value)
        ? filters.priceRanges.filter(v => v !== value)
        : [...filters.priceRanges, value],
    })
  }

  const toggleStorage = (value: string) => {
    onChange({
      ...filters,
      storages: filters.storages.includes(value)
        ? filters.storages.filter(v => v !== value)
        : [...filters.storages, value],
    })
  }

  const toggleColor = (value: string) => {
    onChange({
      ...filters,
      colors: filters.colors.includes(value)
        ? filters.colors.filter(v => v !== value)
        : [...filters.colors, value],
    })
  }

  const clearAll = () => onChange(EMPTY_FILTERS)

  const totalSelected =
    filters.priceRanges.length +
    filters.storages.length +
    filters.colors.length +
    (filters.inStock ? 1 : 0)

  const filterContent = (idPrefix: string) => (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Filtrlar</h3>
          {totalSelected > 0 && (
            <span className="rounded-full bg-foreground text-background text-xs px-2 py-0.5">
              {totalSelected}
            </span>
          )}
        </div>
        {totalSelected > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Tozalash
          </button>
        )}
      </div>

      {/* In Stock */}
      <div className="py-3 border-b border-border">
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            id={`${idPrefix}-in-stock`}
            className="peer sr-only"
            checked={filters.inStock}
            onChange={() => onChange({ ...filters, inStock: !filters.inStock })}
          />
          <div
            aria-hidden="true"
            className={cn(
              "h-5 w-5 rounded border-2 flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
              filters.inStock
                ? "bg-foreground border-foreground"
                : "border-border group-hover:border-foreground/50"
            )}
          >
            {filters.inStock && (
              <svg className="h-3 w-3 text-background" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <span className="text-sm">Faqat mavjud mahsulotlar</span>
        </label>
      </div>

      {/* Price Range */}
      <div className="border-b border-border py-2">
        <button
          type="button"
          aria-expanded={openSections.includes("price")}
          onClick={() => toggleSection("price")}
          className="flex w-full items-center justify-between py-2 text-left"
        >
          <span className="text-sm font-medium">Narx oralig'i</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 text-muted-foreground", openSections.includes("price") && "rotate-180")} />
        </button>
        {openSections.includes("price") && (
          <div className="mt-1 space-y-1 pb-2">
            {priceRanges.map(({ value, label }) => {
              const isSelected = filters.priceRanges.includes(value)
              return (
                <label key={value} className="flex items-center gap-3 cursor-pointer group py-1">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={isSelected}
                    onChange={() => togglePrice(value)}
                  />
                  <div
                    aria-hidden="true"
                    className={cn(
                      "h-5 w-5 rounded border-2 flex items-center justify-center transition-all shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                      isSelected ? "bg-foreground border-foreground" : "border-border group-hover:border-foreground/50"
                    )}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3 text-background" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className={cn("text-sm transition-colors", isSelected ? "font-medium" : "text-muted-foreground group-hover:text-foreground")}>
                    {label}
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {/* Storage */}
      {availableStorages.length > 0 && (
        <div className="border-b border-border py-2">
          <button
            type="button"
            aria-expanded={openSections.includes("storage")}
            onClick={() => toggleSection("storage")}
            className="flex w-full items-center justify-between py-2 text-left"
          >
            <span className="text-sm font-medium">Xotira</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 text-muted-foreground", openSections.includes("storage") && "rotate-180")} />
          </button>
          {openSections.includes("storage") && (
            <div className="mt-1 flex flex-wrap gap-2 pb-2">
              {availableStorages.map((storage) => {
                const isSelected = filters.storages.includes(storage)
                return (
                  <button
                    key={storage}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleStorage(storage)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150",
                      isSelected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/40 hover:bg-secondary text-muted-foreground"
                    )}
                  >
                    {storage}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Colors */}
      {availableColors.length > 0 && (
        <div className="py-2">
          <button
            type="button"
            aria-expanded={openSections.includes("color")}
            onClick={() => toggleSection("color")}
            className="flex w-full items-center justify-between py-2 text-left"
          >
            <span className="text-sm font-medium">Rang</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200 text-muted-foreground", openSections.includes("color") && "rotate-180")} />
          </button>
          {openSections.includes("color") && (
            <div className="mt-2 flex flex-wrap gap-3 pb-2">
              {availableColors.map(({ name, hex: rawHex }) => {
                const isSelected = filters.colors.includes(name)
                const hex = safeHex(rawHex)
                const isLight = isLightHex(hex)
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    aria-pressed={isSelected}
                    onClick={() => toggleColor(name)}
                    title={name}
                    className={cn(
                      "h-8 w-8 rounded-full transition-all duration-150 relative",
                      isSelected
                        ? "ring-2 ring-foreground ring-offset-2 scale-110"
                        : "hover:scale-110 hover:ring-1 hover:ring-border hover:ring-offset-1"
                    )}
                    style={{
                      backgroundColor: hex,
                      border: isLight ? '1px solid #e5e5e5' : 'none'
                    }}
                  >
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke={isLight ? '#000' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Mobile toggle */}
      <div className="lg:hidden flex items-center gap-3 mb-4">
        <Button
          variant="outline"
          className="flex items-center gap-2 rounded-xl"
          onClick={() => setIsMobileOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtrlar
          {totalSelected > 0 && (
            <span className="rounded-full bg-foreground text-background text-xs h-5 w-5 flex items-center justify-center">
              {totalSelected}
            </span>
          )}
        </Button>
        {totalSelected > 0 && (
          <button onClick={clearAll} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            <X className="h-3.5 w-3.5" />
            Tozalash
          </button>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-24 rounded-2xl border border-border bg-card p-5">
          {filterContent("desktop")}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtrlar">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-background p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Filtrlar</h3>
              <button
                type="button"
                aria-label="Filtrlarni yopish"
                onClick={() => setIsMobileOpen(false)}
                className="rounded-full p-2 hover:bg-secondary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {filterContent("mobile")}
            <Button
              className="w-full mt-6 rounded-xl"
              onClick={() => setIsMobileOpen(false)}
            >
              Natijalarni ko'rish
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
