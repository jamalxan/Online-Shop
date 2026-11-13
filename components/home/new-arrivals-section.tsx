"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react"
import { ProductCard } from "@/components/product-card"
import { Reveal } from "@/components/motion/reveal"
import { clamp, prefersReducedMotion } from "@/lib/motion"
import type { Product } from "@/lib/types"

interface Props {
  products: Product[]
}

const TURN = 22   // degrees a card at the edge of the shelf is turned toward the middle
const RECEDE = 70 // px it steps back

const AUTOPLAY_MS = 2800      // one card every 2.8 s
const RESUME_AFTER_MS = 6000  // how long the shelf waits after the visitor touched it

/** A step waiting for the cards to be re-ordered first. */
interface PendingStep {
  /** a card that is on screen, and where it was — it has to be in the same place after the re-order */
  anchor: HTMLElement
  left: number
  direction: 1 | -1
}

// Sits on the edge of the shelf, level with the middle of the pictures.
const arrowClass =
  "press absolute top-[9.25rem] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full " +
  "border border-border bg-background/90 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"

export function NewArrivalsSection({ products }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // The shelf is endless: instead of running out of cards, the ones that left on one side are moved to
  // the other. `offset` is how many cards the list has been rotated by.
  const [offset, setOffset] = useState(0)
  const pendingRef = useRef<PendingStep | null>(null)
  const remeasureRef = useRef<() => void>(() => {})
  // autoplay waits while any of these is true
  const holdRef = useRef({ hover: false, focus: false, offscreen: true, until: 0 })

  const count = products.length
  const ordered = count > 0 ? [...products.slice(offset % count), ...products.slice(0, offset % count)] : []

  /** Distance between two neighbouring cards (card + gap); 0 when it cannot be measured. */
  const stepSize = () => {
    const first = scrollContainerRef.current?.firstElementChild as HTMLElement | null
    const second = first?.nextElementSibling as HTMLElement | null
    return first && second ? second.offsetLeft - first.offsetLeft : 0
  }

  /**
   * Moves the shelf by one card. When there is no card left in that direction, cards that are out
   * of view on the other side are moved over first (a state change); the layout effect below then
   * puts the scroll position back so that what is on screen has not moved, and takes the step.
   */
  const step = useCallback((direction: 1 | -1) => {
    const scroller = scrollContainerRef.current
    const size = stepSize()
    if (!scroller || !size || count < 2) return
    const maxScroll = scroller.scrollWidth - scroller.clientWidth
    if (maxScroll < 1) return // everything fits: nothing to turn

    const reorder = (by: number) => {
      const edge = scroller.getBoundingClientRect().left
      const anchor = Array.from(scroller.children).find((card) => card.getBoundingClientRect().right > edge) as HTMLElement | undefined
      if (!anchor) return
      pendingRef.current = { anchor, left: anchor.getBoundingClientRect().left, direction }
      setOffset((current) => (((current + by) % count) + count) % count)
    }

    if (direction === 1 && scroller.scrollLeft + size > maxScroll + 1) {
      const passed = Math.floor((scroller.scrollLeft + 1) / size) // cards fully scrolled out on the left
      if (passed === 0) { scroller.scrollTo({ left: 0, behavior: "smooth" }); return }
      reorder(passed)
      return
    }
    if (direction === -1 && scroller.scrollLeft < size - 1) {
      const hidden = Math.floor((maxScroll - scroller.scrollLeft + 1) / size) // … on the right
      if (hidden === 0) { scroller.scrollTo({ left: maxScroll, behavior: "smooth" }); return }
      reorder(-hidden)
      return
    }
    scroller.scrollBy({ left: direction * size, behavior: "smooth" })
  }, [count])

  // After the cards were re-ordered: put the view back where it was, then take the step. The
  // position is corrected by measuring the anchor card, not by a computed distance — the browser may
  // already have followed the card it was snapped to, and then there is nothing left to correct.
  useLayoutEffect(() => {
    const pending = pendingRef.current
    const scroller = scrollContainerRef.current
    if (!pending || !scroller) return
    pendingRef.current = null
    const moved = pending.anchor.getBoundingClientRect().left - pending.left
    if (Math.abs(moved) > 0.5) scroller.scrollTo({ left: scroller.scrollLeft + moved, behavior: "instant" })
    remeasureRef.current()
    scroller.scrollBy({ left: pending.direction * stepSize(), behavior: "smooth" })
  }, [offset])

  const hold = (ms = RESUME_AFTER_MS) => { holdRef.current.until = Date.now() + ms }

  // The row is a curved shelf: a card in the middle faces the visitor, cards toward the edges turn
  // inward and step back. The curve follows the scroll position (swipe, trackpad, arrows, autoplay).
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
        const offsetFromMiddle = clamp((centers[index] - middle) / reach, -1.3, 1.3)
        card.style.transform =
          `perspective(1100px) translate3d(0, 0, ${(-Math.abs(offsetFromMiddle) * RECEDE).toFixed(1)}px) rotateY(${(-offsetFromMiddle * TURN).toFixed(2)}deg)`
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render)
    }
    const remeasure = () => {
      measure()
      schedule()
    }
    // the cards were re-ordered: their places changed, so measure and draw before the next paint
    remeasureRef.current = () => {
      measure()
      render()
    }

    measure()
    render()
    scroller.addEventListener("scroll", schedule, { passive: true })
    const resizeObserver = new ResizeObserver(remeasure)
    resizeObserver.observe(scroller)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      remeasureRef.current = () => {}
      scroller.removeEventListener("scroll", schedule)
      resizeObserver.disconnect()
      for (const card of cards) card.style.transform = ""
    }
  }, [products])

  // Autoplay: the shelf turns by itself, and gets out of the way the moment someone uses it.
  const canAutoplay = count > 1
  useEffect(() => {
    const scroller = scrollContainerRef.current
    if (!scroller || !canAutoplay || prefersReducedMotion()) return
    const state = holdRef.current

    const visibility = new IntersectionObserver(([entry]) => { state.offscreen = !entry.isIntersecting }, { threshold: 0.3 })
    visibility.observe(scroller)
    const timer = setInterval(() => {
      if (document.hidden || state.offscreen || state.hover || state.focus || Date.now() < state.until) return
      step(1)
    }, AUTOPLAY_MS)

    return () => {
      clearInterval(timer)
      visibility.disconnect()
    }
  }, [canAutoplay, step])

  if (count === 0) return null

  return (
    <section className="py-20 lg:py-32 bg-background overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-balance">
            Yangi kelganlar
          </h2>
          <Link
            href="/products"
            className="group flex items-center gap-2 text-sm font-medium hover:text-muted-foreground transition-colors"
          >
            Barchasi
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
          </Link>
        </Reveal>

        {/* The shelf turns by itself and waits while the pointer or the keyboard focus is on it. */}
        <Reveal kind="slide" className="relative mt-10">
          {canAutoplay && (
            <>
              <button type="button" className={`${arrowClass} left-1 xl:-left-5`} onClick={() => { hold(); step(-1) }} aria-label="Oldingi mahsulot">
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" className={`${arrowClass} right-1 xl:-right-5`} onClick={() => { hold(); step(1) }} aria-label="Keyingi mahsulot">
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          )}
          <div
            ref={scrollContainerRef}
            role="group"
            aria-roledescription="karusel"
            aria-label="Yangi kelgan mahsulotlar"
            className="-mx-4 px-4 scroll-px-4 flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory pt-2 pb-6"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            onPointerEnter={(event) => { if (event.pointerType === "mouse") holdRef.current.hover = true }}
            onPointerLeave={() => { holdRef.current.hover = false }}
            onFocus={() => { holdRef.current.focus = true }}
            onBlur={() => { holdRef.current.focus = false }}
            onPointerDown={() => hold()}
            onWheel={() => hold()}
            onTouchMove={() => hold()}
          >
            {ordered.map((product) => (
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
