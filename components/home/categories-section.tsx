import Link from "next/link"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { getCategories } from "@/lib/api"

export async function CategoriesSection() {
  const categories = await getCategories()
  if (categories.length === 0) return null

  return (
      <section className="py-20 lg:py-32 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Kategoriyalar
              </p>
              <h2 className="mt-2 font-serif text-3xl sm:text-4xl lg:text-5xl text-balance">
                Kategoriya bo'yicha tanlang
              </h2>
            </div>
            <Link
                href="/products"
                className="group flex items-center gap-2 text-sm font-medium hover:text-muted-foreground transition-colors"
            >
              Barcha mahsulotlar
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category, index) => (
                <Link
                    key={category.id}
                    href={category.href}
                    className={`group relative overflow-hidden rounded-2xl bg-secondary ${
                        index === 0 ? "sm:col-span-2 lg:col-span-1 lg:row-span-2" : ""
                    }`}
                >
                  <div
                      className={`relative ${
                          index === 0 ? "aspect-square lg:aspect-auto lg:h-full" : "aspect-[4/3]"
                      }`}
                  >
                    <Image
                        src={category.image}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/20 to-transparent" />
                  </div>
                  <div className="absolute inset-0 flex flex-col justify-end p-6">
                    <div className="flex items-end justify-between">
                      <div>
                        <h3 className="mt-1 text-2xl font-semibold text-background">
                          {category.name}
                        </h3>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-foreground transition-transform group-hover:scale-110">
                        <ArrowUpRight className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                </Link>
            ))}
          </div>
        </div>
      </section>
  )
}