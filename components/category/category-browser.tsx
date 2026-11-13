"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ProductFilters, type FilterState } from "@/components/category/product-filters"
import { ProductGrid } from "@/components/category/product-grid"
import { useMoney } from "@/lib/currency"
import { activeFilterCount, catalogHref, priceRangeOptions, type CatalogFilters, type CatalogSort } from "@/lib/catalog"
import type { CatalogFacets, Paged, Product } from "@/lib/types"

interface Props {
  /** the page the server rendered for the current URL */
  page: Paged<Product>
  facets: CatalogFacets
  /** filter state parsed from the URL */
  filters: CatalogFilters
  /** "/products" or "/category/<slug>" */
  basePath: string
}

/**
 * Filters, sorting and paging are applied by the API. This island only turns a change into a new URL;
 * the server component then renders that page. The URL is the single source of truth, so a filtered
 * listing can be shared, bookmarked and reached with the back button.
 */
export function CategoryBrowser({ page, facets, filters, basePath }: Props) {
  const router = useRouter()
  const { base, currency, rate } = useMoney()
  const [pending, startTransition] = useTransition()

  const go = (next: CatalogFilters) => {
    startTransition(() => router.push(catalogHref(basePath, next), { scroll: false }))
  }

  const panelState: FilterState = {
    priceRanges: filters.priceRanges, storages: filters.storages, colors: filters.colors, inStock: filters.inStock,
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <ProductFilters
        storages={facets.storages}
        colors={facets.colors}
        priceRanges={priceRangeOptions(base, currency, rate)}
        filters={panelState}
        onChange={(next) => go({ ...filters, ...next, page: 1 })}
      />
      <ProductGrid
        page={page}
        sort={filters.sort}
        onSortChange={(sort: CatalogSort) => go({ ...filters, sort, page: 1 })}
        hrefForPage={(number) => catalogHref(basePath, { ...filters, page: number })}
        pending={pending}
        filtered={activeFilterCount(filters) > 0 || Boolean(filters.q)}
      />
    </div>
  )
}
