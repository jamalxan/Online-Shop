import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { ProductCard } from "@/components/product-card"
import type { Product } from "@/lib/types"

interface RelatedProductsProps {
  /** Real products from the same category (current product already excluded). */
  products: Product[]
  categoryHref?: string
}

export function RelatedProducts({ products, categoryHref }: RelatedProductsProps) {
  if (products.length === 0) return null

  return (
    <section className="py-16 lg:py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Sizga yoqishi mumkin
            </p>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl">
              O'xshash mahsulotlar
            </h2>
          </div>
          {categoryHref && (
            <Link
              href={categoryHref}
              className="group flex items-center gap-2 text-sm font-medium hover:text-muted-foreground transition-colors"
            >
              Barchasini ko'rish
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </Link>
          )}
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {products.map((product) => (
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
      </div>
    </section>
  )
}
