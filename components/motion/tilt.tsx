"use client"

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { createLoop, hasFinePointer, lerp, prefersReducedMotion } from "@/lib/motion"

type TiltProps = {
  /** how far the surface leans toward the pointer, in degrees */
  max?: number
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, "children">

/**
 * A surface that leans toward the pointer in 3D. The wrapper supplies the perspective and two
 * custom properties (--tilt-x / --tilt-y, in degrees); the child with class `tilt-plane` turns,
 * and anything inside it with `tilt-layer` stands off the surface by its own --z (globals.css).
 *
 * Mouse and trackpad only: on touch screens and with reduced motion it stays a flat block.
 */
export function Tilt({ max = 7, className, children, ...rest }: TiltProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || prefersReducedMotion() || !hasFinePointer()) return

    let targetX = 0, targetY = 0 // degrees
    let currentX = 0, currentY = 0

    const loop = createLoop(() => {
      currentX = lerp(currentX, targetX, 0.14)
      currentY = lerp(currentY, targetY, 0.14)
      const settled = Math.abs(currentX - targetX) < 0.02 && Math.abs(currentY - targetY) < 0.02
      if (settled) { currentX = targetX; currentY = targetY }
      element.style.setProperty("--tilt-x", `${currentX.toFixed(2)}deg`)
      element.style.setProperty("--tilt-y", `${currentY.toFixed(2)}deg`)
      return !settled
    })

    const onMove = (event: PointerEvent) => {
      const box = element.getBoundingClientRect()
      const x = (event.clientX - box.left) / box.width - 0.5  // -0.5 … 0.5
      const y = (event.clientY - box.top) / box.height - 0.5
      targetY = x * 2 * max
      targetX = -y * 2 * max
      loop.wake()
    }
    const onLeave = () => {
      targetX = 0
      targetY = 0
      loop.wake()
    }

    element.addEventListener("pointermove", onMove)
    element.addEventListener("pointerleave", onLeave)
    return () => {
      loop.stop()
      element.removeEventListener("pointermove", onMove)
      element.removeEventListener("pointerleave", onLeave)
      element.style.removeProperty("--tilt-x")
      element.style.removeProperty("--tilt-y")
    }
  }, [max])

  return (
    <div ref={ref} className={cn("tilt", className)} {...rest}>
      {children}
    </div>
  )
}
