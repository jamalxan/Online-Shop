// Small helpers for the landing page's motion layer (components/motion/*, components/home/*).
// No animation library: everything is transform/opacity written straight to the element,
// driven by scroll position or the pointer, and switched off for prefers-reduced-motion.

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

export const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount

/** True when the visitor asked the system for less motion (or we cannot tell — then stay still). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** A mouse or trackpad that can hover — touch screens get the scroll-driven motion only. */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches
}

/**
 * A render loop that sleeps. `frame` returns true while it still has distance to cover
 * (values easing toward their targets); once it returns false the loop stops and costs nothing
 * until `wake()` is called again from a scroll, resize or pointer event.
 */
export function createLoop(frame: () => boolean) {
  let id = 0
  const tick = () => {
    id = 0
    if (frame()) id = requestAnimationFrame(tick)
  }
  return {
    wake() {
      if (!id) id = requestAnimationFrame(tick)
    },
    stop() {
      if (id) cancelAnimationFrame(id)
      id = 0
    },
  }
}
