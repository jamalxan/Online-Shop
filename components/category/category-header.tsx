import Image from "next/image"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

interface CategoryHeaderProps {
  name: string
  description?: string
  banner: string
  productCount: number
}

export function CategoryHeader({ name, description, banner, productCount }: CategoryHeaderProps) {
  return (
    <section className="relative">
      {/* Banner Image (decorative, LCP element of the page) */}
      <div className="relative h-64 sm:h-80 lg:h-96 overflow-hidden">
        <Image
          src={banner}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/40 to-transparent" />
      </div>

      {/* Content Overlay */}
      <div className="absolute inset-0 flex flex-col justify-end">
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8 lg:pb-12">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-background/70 mb-4">
            <Link href="/" className="hover:text-background transition-colors">
              Bosh sahifa
            </Link>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            <span className="text-background" aria-current="page">{name}</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-background">
                {name}
              </h1>
              {description && (
                <p className="mt-2 max-w-xl text-background/80">
                  {description}
                </p>
              )}
            </div>
            <p className="text-sm text-background/70">
              {productCount} ta mahsulot
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
