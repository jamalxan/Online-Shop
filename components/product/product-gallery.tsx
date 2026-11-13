"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, ZoomIn, X } from "lucide-react"
import { cn, safeHex } from "@/lib/utils"
import type { ColorVariant } from "@/lib/types"

interface ProductGalleryProps {
  images: string[]
  name: string
  activeColor?: ColorVariant | null
}

export function ProductGallery({ images: fallbackImages, name, activeColor }: ProductGalleryProps) {
  // If active color has images use them, otherwise fallback
  const images = (activeColor?.images && activeColor.images.length > 0)
    ? activeColor.images
    : fallbackImages

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  // Reset to first image when color changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [activeColor?.id])

  // ESC closes the lightbox
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightbox])

  const prev = () => setSelectedIndex(i => (i - 1 + images.length) % images.length)
  const next = () => setSelectedIndex(i => (i + 1) % images.length)

  return (
    <>
      {/* Sticky only in the two-column layout. In one column the photo would stay pinned
          while the title, price and tabs scroll underneath it. */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        {/* Main Image */}
        <div className="relative overflow-hidden rounded-2xl bg-secondary aspect-square group">
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label="Rasmni kattalashtirish"
            className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Image
              src={images[selectedIndex] || '/placeholder.jpg'}
              alt={`${name}${activeColor ? ' — ' + activeColor.name : ''}`}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover transition-all duration-500 group-hover:scale-[1.03]"
              priority
            />
          </button>

          {/* Zoom hint */}
          <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur-sm p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </div>

          {/* Color badge */}
          {activeColor && (
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-background/80 backdrop-blur-sm px-3 py-1.5">
              <span
                className="h-3 w-3 rounded-full border border-white/30"
                style={{ backgroundColor: safeHex(activeColor.hex) }}
              />
              <span className="text-xs font-medium">{activeColor.name}</span>
            </div>
          )}

          {/* Arrows (only if multiple images) */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Oldingi rasm"
                onClick={(e) => { e.stopPropagation(); prev() }}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-sm p-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-background shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Keyingi rasm"
                onClick={(e) => { e.stopPropagation(); next() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-sm p-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-background shadow-sm"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}-rasm`}
                aria-current={selectedIndex === i}
                onClick={() => setSelectedIndex(i)}
                className={cn(
                  "relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-200",
                  selectedIndex === i
                    ? "border-foreground scale-105 shadow-md"
                    : "border-transparent hover:border-border hover:scale-102"
                )}
              >
                <Image src={img} alt="" fill sizes="80px" className="object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Dot indicators (mobile) */}
        {images.length > 1 && (
          <div className="flex justify-center gap-2 sm:hidden">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}-rasm`}
                onClick={() => setSelectedIndex(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-200",
                  selectedIndex === i ? "w-6 bg-foreground" : "w-2 bg-border"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} — rasmlar`}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            autoFocus
            aria-label="Yopish"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightbox(false)}
          >
            <X className="h-5 w-5" />
          </button>
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Oldingi rasm"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); prev() }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Keyingi rasm"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); next() }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <div
            className="relative h-[80vh] w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={images[selectedIndex]}
              alt={name}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-contain"
            />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {selectedIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  )
}
