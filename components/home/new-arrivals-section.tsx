"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react"
import { ProductCard } from "@/components/product-card"
import { Reveal } from "@/components/motion/reveal"
import { Button } from "@/components/ui/button"
import { clamp, prefersReducedMotion } from "@/lib/motion"
import type { Product } from "@/lib/types"

interface Props {
  products: Product[]
}

const TURN = 22   // degrees a card at the edge of the shelf is turned toward the middle
const RECEDE = 70 // px it steps back

export function NewArrivalsSection({ products }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return
    scrollContainerRef.current.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    })
  }

  // The row is a curved shelf: a card in the middle faces the visitor, cards toward the edges turn
  // inward and step back. The curve follows the scroll position (swipe, trackpad or the arrows).
  useEffect(() => {
    const scroller = scrollContainerRef.current
    if (!scroller || prefersReducedMotion()) return
    const cards = Array.from(scroller.querySelectorAll<HTMLElement>("[data-shelf-card]"))
    if (cards.length === 0) return

    let centers: number[] = [] // each card's middle, measured from the scroller's content edge
    let frame = 0

    const measure = () => {
      const origin = scroller.getBoundingClientRect().left - scroller.scrollLeft
      centers = cards.map((card) => {
        const box = (card.parentElement ?? card).getBoundingClientRect()
        return box.left - origin + box.width / 2
      })
    }
    const render = () => {
      frame = 0
      const middle = scroller.scrollLeft + scroller.clientWidth / 2
      // on a phone the neighbours of the centred card should lean a little, not lie flat
      const reach = Math.max(scroller.clientWidth / 2, 420)
      cards.forEach((card, index) => {
        const offset = clamp((centers[index] - middle) / reach, -1.3, 1.3)
        card.style.transform =
          `perspective(1100px) translate3d(0, 0, ${(-Math.abs(offset) * RECEDE).toFixed(1)}px) rotateY(${(-offset * TURN).toFixed(2)}deg)`
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render)
    }
    const remeasure = () => {
      measure()
      schedule()
    }

    measure()
    render()
    scroller.addEventListener("scroll", schedule, { passive: true })
    const resizeObserver = new ResizeObserver(remeasure)
    resizeObserver.observe(scroller)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      scroller.removeEventListener("scroll", schedule)
      resizeObserver.disconnect()
      for (const card of cards) card.style.transform = ""
    }
  }, [products])

  if (products.length === 0) return null

  return (
    <section className="py-20 lg:py-32 bg-background overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-balance">
            Yangi kelganlar
          </h2>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="outline" size="icon" className="press rounded-full" onClick={() => scroll("left")} aria-label="Chapga surish">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" size="icon" className="press rounded-full" onClick={() => scroll("right")} aria-label="O'ngga surish">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <Link
              href="/products"
              className="group flex items-center gap-2 text-sm font-medium hover:text-muted-foreground transition-colors"
            >
              Barchasi
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>

        <Reveal kind="slide">
          <div
            ref={scrollContainerRef}
            className="mt-10 -mx-4 px-4 flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory pt-2 pb-6"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {products.map((product) => (
              <div key={product.id} className="w-[280px] flex-shrink-0 snap-start">
                <div data-shelf-card>
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
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
