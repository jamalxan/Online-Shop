"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ChevronRight, Heart, ShoppingBag, Truck, Shield,
  CreditCard, Check, Minus, Plus, MessageCircle, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, formatPrice, isLightHex, safeHex } from "@/lib/utils"
import { useStore } from "@/lib/store-context"
import type { ColorVariant, Product, StorageOption } from "@/lib/types"

interface ProductInfoProps {
  product: Product
  categoryHref?: string
  selectedColor: ColorVariant | null
  onColorChange: (color: ColorVariant) => void
}

function storageText(option: StorageOption): string {
  return option.ram ? `${option.storage} / ${option.ram}` : option.storage
}

export function ProductInfo({ product, categoryHref, selectedColor, onColorChange }: ProductInfoProps) {
  const { addToCart, addToWishlist, removeFromWishlist, isInWishlist } = useStore()

  const colorVariants = product.colorVariants ?? []
  const storageOptions = product.storageOptions ?? []

  // Default to the cheapest option — the same one the server picks and the list price shows.
  const [selectedStorage, setSelectedStorage] = useState<StorageOption | null>(() =>
    storageOptions.length ? storageOptions.reduce((min, s) => (s.price < min.price ? s : min)) : null
  )
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)

  const stock = Math.max(0, product.quantity)
  const inStock = stock > 0
  const wishlisted = isInWishlist(product.id)

  // Server-computed prices only: the selected option's final price, or the product's.
  const activePrice = selectedStorage?.price ?? product.price
  const activeOriginal = selectedStorage ? selectedStorage.originalPrice : product.originalPrice
  const discountPercent = product.discount

  const currentImage = selectedColor?.images?.[0] ?? product.image

  const handleAddToCart = async () => {
    if (adding || !inStock) return
    setAdding(true)
    const variantParts = [selectedStorage ? storageText(selectedStorage) : null, selectedColor?.name ?? null]
      .filter((part): part is string => Boolean(part))
    await addToCart(
      {
        id: product.id,
        name: product.name,
        price: activePrice,
        originalPrice: activeOriginal,
        image: currentImage,
        category: product.category,
        quantity: stock,
      },
      Math.min(quantity, stock),
      {
        storageOptionId: selectedStorage?.id,
        colorVariantId: selectedColor?.id,
        label: variantParts.length ? variantParts.join(" · ") : undefined,
      },
    )
    setAdding(false)
  }

  const handleWishlist = async () => {
    if (wishlisted) {
      await removeFromWishlist(product.id)
    } else {
      await addToWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        originalPrice: product.originalPrice,
        image: product.image,
        category: product.category,
        quantity: stock,
      })
    }
  }

  return (
    <div className="flex flex-col">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground mb-4 flex-wrap">
        <Link href="/" className="hover:text-foreground transition-colors">Bosh sahifa</Link>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        {categoryHref && product.category && (
          <>
            <Link href={categoryHref} className="hover:text-foreground transition-colors">
              {product.category}
            </Link>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </>
        )}
        <span className="text-foreground truncate max-w-[200px]" aria-current="page">{product.name}</span>
      </nav>

      {/* Badges */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {discountPercent > 0 && (
          <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white">
            -{discountPercent}%
          </span>
        )}
        <span className={cn(
          "rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1",
          inStock ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full", inStock ? "bg-green-600" : "bg-red-500")} aria-hidden="true" />
          {inStock ? "Mavjud" : "Tugagan"}
        </span>
      </div>

      {/* Title */}
      <h1 className="font-serif text-3xl sm:text-4xl leading-tight">{product.name}</h1>

      {/* Price */}
      <div className="mt-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-3xl font-semibold">{formatPrice(activePrice)}</span>
          {activeOriginal !== undefined && activeOriginal > activePrice && (
            <span className="text-lg text-muted-foreground line-through">
              <span className="sr-only">Avvalgi narx: </span>
              {formatPrice(activeOriginal)}
            </span>
          )}
          {selectedStorage && (
            <span className="text-sm text-muted-foreground">({storageText(selectedStorage)})</span>
          )}
        </div>
      </div>

      {/* Description */}
      {product.description && (
        <p className="mt-6 text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</p>
      )}

      {/* ─── Color Selection ─── */}
      {colorVariants.length > 0 && (
        <fieldset className="mt-8">
          <legend className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium">Rang:</span>
            <span className="text-sm text-muted-foreground">{selectedColor?.name}</span>
          </legend>
          <div className="flex flex-wrap gap-3">
            {colorVariants.map((color) => {
              const hex = safeHex(color.hex)
              const isLight = isLightHex(hex)
              const isSelected = selectedColor?.id === color.id
              return (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => onColorChange(color)}
                  title={color.name}
                  aria-label={color.name}
                  aria-pressed={isSelected}
                  className={cn(
                    "h-10 w-10 rounded-full transition-all duration-200 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected
                      ? "ring-2 ring-foreground ring-offset-2 scale-110"
                      : "hover:scale-110 hover:ring-2 hover:ring-border hover:ring-offset-1"
                  )}
                  style={{ backgroundColor: hex, border: isLight ? '1px solid #e5e5e5' : 'none' }}
                >
                  {isSelected && (
                    <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                      <Check className="h-4 w-4" style={{ color: isLight ? '#000' : '#fff' }} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {/* ─── Storage/RAM Selection ─── */}
      {storageOptions.length > 0 && (
        <fieldset className="mt-8">
          <legend className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium">
              {storageOptions.some((o) => o.ram) ? "Xotira / RAM:" : "Xotira:"}
            </span>
            <span className="text-sm text-muted-foreground">
              {selectedStorage ? storageText(selectedStorage) : ""}
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {storageOptions.map((option) => {
              const isSelected = selectedStorage?.id === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedStorage(option)}
                  aria-pressed={isSelected}
                  className={cn(
                    "rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected
                      ? "border-foreground bg-foreground text-background shadow-md"
                      : "border-border hover:border-foreground/40 hover:bg-secondary"
                  )}
                >
                  <span className="font-semibold">{option.label}</span>
                  <span className={cn("ml-2 text-xs", isSelected ? "text-background/70" : "text-muted-foreground")}>
                    {formatPrice(option.price)}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {/* ─── Quantity ─── */}
      <div className="mt-8">
        <span className="text-sm font-medium" id="quantity-label">Miqdor</span>
        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center rounded-xl border border-border overflow-hidden" role="group" aria-labelledby="quantity-label">
            <button
              type="button"
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Miqdorni kamaytirish"
              className="p-3 hover:bg-secondary transition-colors disabled:opacity-30"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="w-12 text-center font-semibold" aria-live="polite">{Math.min(quantity, Math.max(stock, 1))}</span>
            <button
              type="button"
              onClick={() => setQuantity(q => Math.min(q + 1, stock))}
              disabled={!inStock || quantity >= stock}
              aria-label="Miqdorni oshirish"
              className="p-3 hover:bg-secondary transition-colors disabled:opacity-30"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {inStock && (
            <span className="text-sm text-muted-foreground">{stock} dona qoldi</span>
          )}
        </div>
      </div>

      {/* ─── Actions ─── */}
      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Button
          size="lg"
          className="flex-1 rounded-xl h-14 text-base font-semibold"
          disabled={!inStock || adding}
          onClick={handleAddToCart}
        >
          {adding
            ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            : <ShoppingBag className="mr-2 h-5 w-5" aria-hidden="true" />}
          {inStock ? (
            <>
              Savatga qo&apos;shish
              {/* the price is shown above; on very narrow phones a so'm amount would push the button off-screen */}
              <span className="max-[380px]:hidden">&nbsp;· {formatPrice(activePrice)}</span>
            </>
          ) : "Tugagan"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          aria-pressed={wishlisted}
          aria-label={wishlisted ? "Sevimlilardan o'chirish" : "Sevimlilarga qo'shish"}
          className={cn(
            "rounded-xl h-14 px-5 transition-colors",
            wishlisted && "text-red-500 border-red-300 bg-red-50 hover:bg-red-100"
          )}
          onClick={handleWishlist}
        >
          <Heart className={cn("h-5 w-5", wishlisted && "fill-current")} aria-hidden="true" />
        </Button>
      </div>

      {/* ─── Trust Badges ─── */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        {[
          { icon: Truck,      title: "Yetkazib berish",   desc: "Kuryer orqali yoki do'kondan olib ketish" },
          { icon: Shield,     title: "Rasmiy kafolat",    desc: "1 yillik himoya" },
          { icon: CreditCard, title: "To'lov",            desc: "Qabul qilganda — naqd yoki karta" },
          { icon: Check,      title: "100% Original",     desc: "Sertifikatlangan mahsulot" },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3 rounded-xl bg-secondary p-4">
            <Icon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Contact ─── */}
      <div className="mt-6 flex items-center gap-4 rounded-xl border border-border p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary shrink-0">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Bu mahsulot haqida savol bormi?</p>
          <p className="text-xs text-muted-foreground">Biz bilan bog'laning — yordam beramiz</p>
        </div>
        <Button variant="outline" className="rounded-full text-sm shrink-0" size="sm" asChild>
          <Link href="/contact">Bog'lanish</Link>
        </Button>
      </div>
    </div>
  )
}
