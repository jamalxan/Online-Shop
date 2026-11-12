"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { ProductCard } from "@/components/product-card"
import { getProductPageSafe } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Category, Product } from "@/lib/types"

const ALL_TAB = "all"

interface Props {
  /** newest products, rendered on the server for the "Barchasi" tab */
  products: Product[]
  /** categories that have at least one active product — one tab each */
  categories: Category[]
  /** cards per tab */
  pageSize: number
}

export function BestSellersSection({ products, categories, pageSize }: Props) {
  const [activeTab, setActiveTab] = useState(ALL_TAB)
  // A category's products are fetched the first time its tab is opened (one bounded request),
  // instead of shipping the whole catalogue to every visitor of the home page.
  const [byTab, setByTab] = useState<Record<string, Product[]>>({ [ALL_TAB]: products })
  const requested = useRef(new Set<string>([ALL_TAB]))

  const tabs = [{ id: ALL_TAB, label: "Barchasi" }, ...categories.map((c) => ({ id: String(c.id), label: c.name }))]

  const openTab = (id: string) => {
    setActiveTab(id)
    if (requested.current.has(id)) return
    requested.current.add(id)
    void getProductPageSafe({ category: Number(id), pageSize }).then((page) => {
      setByTab((current) => ({ ...current, [id]: page.results }))
    })
  }

  const filteredProducts = byTab[activeTab]
  const loading = filteredProducts === undefined

  if (products.length === 0) return null

  return (
      <section className="py-20 lg:py-32 bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Katalog
                </p>
                <h2 className="mt-2 font-serif text-3xl sm:text-4xl lg:text-5xl text-balance">
                  Mahsulotlarimiz
                </h2>
              </div>
              <Link
                  href="/products"
                  className="group flex items-center gap-2 text-sm font-medium hover:text-muted-foreground transition-colors"
              >
                Barcha mahsulotlar
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </Link>
            </div>

            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                  <button
                      key={tab.id}
                      type="button"
                      aria-pressed={activeTab === tab.id}
                      onClick={() => openTab(tab.id)}
                      className={cn(
                          "rounded-full px-5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          activeTab === tab.id
                              ? "bg-foreground text-background"
                              : "bg-background text-foreground hover:bg-muted"
                      )}
                  >
                    {tab.label}
                  </button>
              ))}
            </div>
          </div>

          <div aria-busy={loading} className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 4 }, (_, i) => (
                  <div key={i} aria-hidden="true" className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
                ))
              : filteredProducts.slice(0, pageSize).map((product) => (
                  <ProductCard
                      key={product.id}
                      id={product.id}
                      name={product.name}
                      category={product.category}
                      price={product.price}
                      originalPrice={product.originalPrice}
                      image={product.image}
                      quantity={product.quantity}
                      sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                ))}
          </div>
          {!loading && filteredProducts.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">Bu bo'limda hozircha mahsulot yo'q.</p>
          )}
        </div>
      </section>
  )
}