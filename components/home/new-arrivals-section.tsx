"use client"

import { useRef } from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react"
import { ProductCard } from "@/components/product-card"
import { Button } from "@/components/ui/button"
import type { Product } from "@/lib/types"

interface Props {
  products: Product[]
}

export function NewArrivalsSection({ products }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return
    scrollContainerRef.current.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    })
  }

  if (products.length === 0) return null

  return (
      <section className="py-20 lg:py-32 bg-background overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Yangi
              </p>
              <h2 className="mt-2 font-serif text-3xl sm:text-4xl lg:text-5xl text-balance">
                Yangi kelganlar
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2">
                <Button variant="outline" size="icon" className="rounded-full" onClick={() => scroll("left")} aria-label="Chapga surish">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="outline" size="icon" className="rounded-full" onClick={() => scroll("right")} aria-label="O'ngga surish">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <Link
                  href="/products"
                  className="group flex items-center gap-2 text-sm font-medium hover:text-muted-foreground transition-colors"
              >
                Barchasi
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>

          <div
              ref={scrollContainerRef}
              className="mt-10 -mx-4 px-4 flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {products.map((product) => (
                <div key={product.id} className="w-[280px] flex-shrink-0 snap-start">
                  <ProductCard
                      id={product.id}
                      name={product.name}
                      category={product.category}
                      price={product.price}
                      originalPrice={product.originalPrice}
                      image={product.image}
                      quantity={product.quantity}
                      sizes="280px"
                      isNew
                  />
                </div>
            ))}
          </div>
        </div>
      </section>
  )
}