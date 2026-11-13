"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import Image from "next/image"
import Link from "next/link"
import { clamp, createLoop, hasFinePointer, lerp, prefersReducedMotion } from "@/lib/motion"
import { cn, formatPrice, type Currency } from "@/lib/utils"

export interface StageProduct {
  id: string
  name: string
  price: number
  image: string
}

interface HeroStageProps {
  /** up to three real catalogue products that stand off the photograph */
  products: StageProduct[]
  minPrice?: number
  currency: Currency
}

// The same numbers as the resting state in globals.css (.hero-stage…): the script starts from
// exactly what the stylesheet painted, so nothing jumps when the page hydrates.
const LEAN = 26          // degrees the photograph leans back while it is still entering
const SCALE = 0.88       // … and how small it starts
const PHOTO_ZOOM = 0.14  // the picture inside the frame settles from 1.14 to 1
const POINTER_LEAN = 4   // degrees toward the mouse

/**
 * Where each card sits: phone · ≥640px · ≥1280px. On a phone they are compact rows (picture beside
 * the text) that zigzag down the photograph; from 640px they are small cards with the picture on top,
 * and from 1280px there is room for them to hang off the photograph's edges.
 *
 * Perspective pushes a near card outward (a card 170px in front is drawn about 14% further from the
 * middle), so the offsets leave that much room before the section's edge clips them.
 */
const SLOTS = [
  {
    depth: 120, drift: 70,
    box: "flex sm:block -top-7 left-3 w-52 sm:-top-12 sm:left-6 sm:w-36 xl:-left-24 xl:top-14 xl:w-44 2xl:-left-28",
  },
  {
    depth: 170, drift: 120,
    box: "flex sm:block top-[34%] right-5 w-52 sm:top-[38%] sm:right-10 sm:w-40 xl:-right-20 xl:top-[30%] xl:w-48 2xl:-right-32",
  },
  {
    depth: 90, drift: 160,
    box: "hidden xl:block xl:right-[18%] xl:-bottom-16 xl:w-40",
  },
] as const

/**
 * The hero's photograph as a plane in 3D. It leans back while it enters the screen and comes
 * upright as the visitor scrolls to it; real products from the catalogue stand in front of it at
 * different depths, so they shift against the picture as it turns, and the whole stage leans a
 * few degrees toward a mouse. Scroll position and pointer are the only inputs — nothing loops.
 */
export function HeroStage({ products, minPrice, currency }: HeroStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || prefersReducedMotion()) return
    const plane = stage.querySelector<HTMLElement>("[data-stage-plane]")
    const photo = stage.querySelector<HTMLElement>("[data-stage-photo]")
    if (!plane) return
    const floats = Array.from(stage.querySelectorAll<HTMLElement>("[data-stage-float]")).map((element) => ({
      element,
      depth: Number(element.dataset.depth) || 0,
      drift: Number(element.dataset.drift) || 0,
    }))

    let progress = 0, targetProgress = 0 // 0 = entering, leaning back · 1 = presented, upright
    let pointerX = 0, pointerY = 0, targetPointerX = 0, targetPointerY = 0 // -1 … 1
    let onScreen = true

    const measure = () => {
      const box = stage.getBoundingClientRect()
      const viewport = window.innerHeight
      // 0 when the stage's top edge reaches the bottom of the screen, 1 when its middle reaches the middle
      targetProgress = clamp((viewport - box.top) / (viewport * 0.5 + box.height * 0.5))
    }

    const loop = createLoop(() => {
      progress = lerp(progress, targetProgress, 0.12)
      pointerX = lerp(pointerX, targetPointerX, 0.1)
      pointerY = lerp(pointerY, targetPointerY, 0.1)
      const settled =
        Math.abs(progress - targetProgress) < 0.001 &&
        Math.abs(pointerX - targetPointerX) < 0.002 &&
        Math.abs(pointerY - targetPointerY) < 0.002
      if (settled) { progress = targetProgress; pointerX = targetPointerX; pointerY = targetPointerY }

      const rest = 1 - progress
      plane.style.transform =
        `rotateX(${(rest * LEAN - pointerY * POINTER_LEAN).toFixed(2)}deg) ` +
        `rotateY(${(pointerX * POINTER_LEAN).toFixed(2)}deg) ` +
        `scale(${(SCALE + progress * (1 - SCALE)).toFixed(4)})`
      if (photo) photo.style.transform = `scale(${(1 + rest * PHOTO_ZOOM).toFixed(4)})`
      for (const { element, depth, drift } of floats) {
        // nearer cards travel further: against the photograph they read as standing in front of it
        const x = pointerX * depth * 0.1
        const y = rest * drift + pointerY * depth * 0.06
        element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${depth}px)`
      }
      return !settled
    })

    const onScroll = () => {
      if (!onScreen) return
      measure()
      loop.wake()
    }
    const onPointerMove = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect()
      targetPointerX = clamp(((event.clientX - box.left) / box.width - 0.5) * 2, -1, 1)
      targetPointerY = clamp(((event.clientY - box.top) / box.height - 0.5) * 2, -1, 1)
      loop.wake()
    }
    const onPointerLeave = () => {
      targetPointerX = 0
      targetPointerY = 0
      loop.wake()
    }

    // Off screen the stage does no work at all.
    const observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting)
      if (onScreen) onScroll()
    }, { rootMargin: "20% 0px" })
    observer.observe(stage)

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    const pointer = hasFinePointer()
    if (pointer) {
      stage.addEventListener("pointermove", onPointerMove)
      stage.addEventListener("pointerleave", onPointerLeave)
    }
    measure()
    loop.wake()

    return () => {
      loop.stop()
      observer.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (pointer) {
        stage.removeEventListener("pointermove", onPointerMove)
        stage.removeEventListener("pointerleave", onPointerLeave)
      }
      plane.style.transform = ""
      if (photo) photo.style.transform = ""
      for (const { element } of floats) element.style.transform = ""
    }
  }, [products.length])

  const depthStyle = (depth: number, drift: number) => ({ "--depth": `${depth}px`, "--drift": `${drift}px` }) as CSSProperties

  return (
    <div ref={stageRef} className="hero-stage mt-20 w-full max-w-4xl sm:mt-24 xl:mt-16">
      <div data-stage-plane className="hero-stage__plane relative">
        {/* isolate + translateZ(0): older Safari forgets the rounded clip on a transformed child otherwise */}
        <div className="relative isolate aspect-[4/3] overflow-hidden rounded-3xl bg-secondary shadow-2xl [transform:translateZ(0)] sm:aspect-[16/9]">
          <Image
            data-stage-photo
            src="https://images.unsplash.com/photo-1616348436168-de43ad0db179?w=1200&q=80"
            alt="Smartfonning orqa kamerasi yaqindan"
            fill
            sizes="(max-width: 896px) 100vw, 896px"
            className="hero-stage__photo object-cover"
            priority
          />
        </div>

        {minPrice !== undefined && minPrice > 0 && (
          <div
            data-stage-float
            data-depth={60}
            data-drift={40}
            style={depthStyle(60, 40)}
            className="hero-stage__float bottom-3 left-3 rounded-2xl bg-background px-4 py-3 shadow-lg sm:bottom-6 sm:left-6"
          >
            <p className="text-sm text-muted-foreground">Narxlar</p>
            <p className="font-semibold">{formatPrice(minPrice, currency)} dan boshlab</p>
          </div>
        )}

        {products.slice(0, SLOTS.length).map((product, index) => {
          const slot = SLOTS[index]
          return (
            <Link
              key={product.id}
              href={`/product/${product.id}`}
              data-stage-float
              data-depth={slot.depth}
              data-drift={slot.drift}
              style={depthStyle(slot.depth, slot.drift)}
              className={cn(
                "hero-stage__float hero-stage__card items-center gap-3 rounded-2xl bg-card p-2.5 text-left shadow-xl sm:p-3",
                "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground",
                slot.box,
              )}
            >
              <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-secondary sm:aspect-square sm:h-auto sm:w-full">
                <Image src={product.image} alt="" fill sizes="(max-width: 640px) 48px, 192px" className="object-cover" />
              </span>
              <span className="block min-w-0 sm:mt-3">
                <span className="block truncate text-sm font-medium sm:line-clamp-2 sm:whitespace-normal">{product.name}</span>
                <span className="block text-sm font-semibold">{formatPrice(product.price, currency)}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
