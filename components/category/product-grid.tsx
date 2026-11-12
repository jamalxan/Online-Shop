"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react"
import { ProductCard } from "@/components/product-card"
import { CATALOG_SORTS, type CatalogSort } from "@/lib/catalog"
import { cn } from "@/lib/utils"
import type { Paged, Product } from "@/lib/types"

interface ProductGridProps {
  page: Paged<Product>
  sort: CatalogSort
  onSortChange: (sort: CatalogSort) => void
  hrefForPage: (page: number) => string
  /** a new page is being fetched */
  pending: boolean
  /** any filter or search is active (changes the empty-state wording) */
  filtered: boolean
}

/** 1 … 4 5 [6] 7 8 … 20 — the current page, its neighbours and both ends. */
function pageNumbers(current: number, total: number): (number | "gap")[] {
  const wanted = new Set([1, total, current - 1, current, current + 1])
  const pages = [...wanted].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: (number | "gap")[] = []
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) out.push("gap")
    out.push(n)
  })
  return out
}

const pageLink =
  "flex h-10 min-w-10 items-center justify-center rounded-xl border border-border px-3 text-sm transition-colors " +
  "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

export function ProductGrid({ page, sort, onSortChange, hrefForPage, pending, filtered }: ProductGridProps) {
  const products = page.results

  return (
    <div className="flex-1 min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-semibold text-foreground">{page.count}</span> ta mahsulot topildi
        </p>
        <div className="flex items-center gap-3">
          <select
            value={sort}
            onChange={e => onSortChange(e.target.value as CatalogSort)}
            aria-label="Saralash"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CATALOG_SORTS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <SearchX className="h-12 w-12 mb-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-lg font-semibold mb-2">Mahsulot topilmadi</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {filtered
              ? "Tanlangan filtrlarga mos mahsulot yo'q. Filtrlarni o'zgartiring."
              : "Bu yerda hozircha mahsulot yo'q."}
          </p>
        </div>
      ) : (
        <div
          aria-busy={pending}
          className={cn("grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 transition-opacity", pending && "opacity-50")}
        >
          {products.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              name={product.name}
              category={product.category}
              price={product.price}
              originalPrice={product.originalPrice}
              image={product.image}
              badge={product.badge}
              quantity={product.quantity}
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 20vw"
            />
          ))}
        </div>
      )}

      {page.pages > 1 && (
        <nav aria-label="Sahifalar" className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {page.page > 1 ? (
            <Link href={hrefForPage(page.page - 1)} rel="prev" aria-label="Oldingi sahifa" className={pageLink}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(pageLink, "pointer-events-none opacity-40")}>
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          {pageNumbers(page.page, page.pages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted-foreground">…</span>
            ) : item === page.page ? (
              <span key={item} aria-current="page" className={cn(pageLink, "border-foreground bg-foreground text-background hover:bg-foreground")}>
                {item}
              </span>
            ) : (
              <Link key={item} href={hrefForPage(item)} aria-label={`${item}-sahifa`} className={pageLink}>
                {item}
              </Link>
            ),
          )}
          {page.page < page.pages ? (
            <Link href={hrefForPage(page.page + 1)} rel="next" aria-label="Keyingi sahifa" className={pageLink}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(pageLink, "pointer-events-none opacity-40")}>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </nav>
      )}
    </div>
  )
}
