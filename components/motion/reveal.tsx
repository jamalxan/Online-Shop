"use client"

import { useEffect, useRef, type ElementType, type HTMLAttributes, type ReactNode, type Ref } from "react"
import { prefersReducedMotion } from "@/lib/motion"

type RevealKind = "rise" | "fold" | "turn" | "slide"

type RevealProps = {
  /** element to render — its direct children are what animate, one after another */
  as?: ElementType
  /** rise: up 28px · fold: tips up out of the page in 3D · turn: swings in like a page · slide: in from the right */
  kind?: RevealKind
  children: ReactNode
} & Omit<HTMLAttributes<HTMLElement>, "children">

/**
 * Entrance for one group: its direct children arrive in reading order the first time the group
 * scrolls into view (CSS in globals.css → "Motion layer").
 *
 * The hidden state is set by this effect and by nothing else. Server HTML, a browser without
 * JavaScript, reduced motion, or a group that is already on screen when the page hydrates all
 * leave the content exactly as rendered — nothing can stay invisible because a script did not run.
 */
export function Reveal({ as: Tag = "div", kind = "rise", children, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || prefersReducedMotion() || !("IntersectionObserver" in window)) return

    const box = element.getBoundingClientRect()
    if (box.top < window.innerHeight && box.bottom > 0) return // already visible: do not replay it

    element.dataset.reveal = "pending"
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        element.dataset.reveal = "in"
        observer.disconnect()
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    )
    observer.observe(element)

    return () => {
      observer.disconnect()
      delete element.dataset.reveal
    }
  }, [])

  return (
    <Tag ref={ref as Ref<HTMLElement>} data-reveal-kind={kind} {...rest}>
      {children}
    </Tag>
  )
}
