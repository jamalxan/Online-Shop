import type { CSSProperties } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { Reveal } from "@/components/motion/reveal"
import { Tilt } from "@/components/motion/tilt"
import { getCategories } from "@/lib/api"
import { cn } from "@/lib/utils"

/** how far a layer stands off its tile while the pointer is over it */
const lift = (z: number) => ({ "--z": `${z}px` }) as CSSProperties

export async function CategoriesSection() {
  const categories = await getCategories()
  if (categories.length === 0) return null

  return (
    <section className="py-20 lg:py-32 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-balance">
            Kategoriya bo&apos;yicha tanlang
          </h2>
          <Link
            href="/products"
            className="group flex items-center gap-2 text-sm font-medium hover:text-muted-foreground transition-colors"
          >
            Barcha mahsulotlar
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
          </Link>
        </Reveal>

        {/* Each tile tips up out of the page as the grid arrives, then leans toward the mouse;
            its name and arrow stand off the photograph, so they shift against it as it turns. */}
        <Reveal kind="fold" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, index) => {
            const featured = index === 0
            return (
              <Tilt
                key={category.id}
                className={cn("relative origin-bottom hover:z-10", featured && "sm:col-span-2 lg:col-span-1 lg:row-span-2")}
              >
                <Link href={category.href} className="tilt-plane group relative block h-full rounded-2xl">
                  <div
                    className={cn(
                      "relative isolate overflow-hidden rounded-2xl bg-secondary",
                      featured ? "aspect-square lg:aspect-auto lg:h-full" : "aspect-[4/3]",
                    )}
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
                  <div className="absolute inset-0 flex items-end justify-between p-6 [transform-style:preserve-3d]">
                    <h3 className="tilt-layer text-2xl font-semibold text-background" style={lift(34)}>
                      {category.name}
                    </h3>
                    <div
                      className="tilt-layer flex h-10 w-10 items-center justify-center rounded-full bg-background text-foreground"
                      style={lift(58)}
                    >
                      <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
                    </div>
                  </div>
                </Link>
              </Tilt>
            )
          })}
        </Reveal>
      </div>
    </section>
  )
}
