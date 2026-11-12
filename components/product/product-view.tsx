"use client"

import { useState } from "react"
import { ProductGallery } from "@/components/product/product-gallery"
import { ProductInfo } from "@/components/product/product-info"
import type { ColorVariant, Product } from "@/lib/types"

interface ProductViewProps {
  product: Product
  categoryHref?: string
}

/** Client island: the gallery follows the colour picked in the info column. */
export function ProductView({ product, categoryHref }: ProductViewProps) {
  const [activeColor, setActiveColor] = useState<ColorVariant | null>(product.colorVariants?.[0] ?? null)
  const fallbackImages = product.photos?.length ? product.photos : [product.image]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
        <ProductGallery images={fallbackImages} name={product.name} activeColor={activeColor} />
        <ProductInfo
          product={product}
          categoryHref={categoryHref}
          selectedColor={activeColor}
          onColorChange={setActiveColor}
        />
      </div>
    </div>
  )
}
