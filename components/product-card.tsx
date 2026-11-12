"use client"

import Image from "next/image"
import Link from "next/link"
import { Heart, ShoppingBag, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, formatPrice } from "@/lib/utils"
import { useStore } from "@/lib/store-context"

interface ProductCardProps {
    id: string
    name: string
    category: string
    price: number
    originalPrice?: number
    image: string
    badge?: string
    isNew?: boolean
    /** stock; undefined = unknown */
    quantity?: number
    /** `sizes` for the image — defaults to a 2/3/4-column grid */
    sizes?: string
    /** the card is above the fold: load its image right away instead of lazily (it is the page's LCP candidate) */
    eager?: boolean
    className?: string
}

const DEFAULT_SIZES = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"

export function ProductCard({
                                id,
                                name,
                                category,
                                price,
                                originalPrice,
                                image,
                                badge,
                                isNew,
                                quantity,
                                sizes = DEFAULT_SIZES,
                                eager = false,
                                className,
                            }: ProductCardProps) {
    const { addToCart, addToWishlist, removeFromWishlist, isInWishlist, cart, showNotification } = useStore()

    const isInCart = cart.some((item) => item.id === id)
    const inWishlist = isInWishlist(id)
    const outOfStock = quantity !== undefined && quantity <= 0

    const discount = originalPrice && originalPrice > price
        ? Math.round(((originalPrice - price) / originalPrice) * 100)
        : 0

    function handleAddToCart() {
        if (outOfStock) return
        if (isInCart) {
            showNotification("Bu mahsulot allaqachon savatda bor", "error")
            return
        }
        void addToCart({ id, name, category, price, originalPrice, image, quantity })
    }

    function handleWishlist() {
        if (inWishlist) {
            void removeFromWishlist(id)
        } else {
            void addToWishlist({ id, name, category, price, originalPrice, image, quantity })
        }
    }

    return (
        <div className={cn("group relative", className)}>
            {/* Image Container */}
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-secondary">
                {/* positioned, so the `fill` image is laid out against the link itself (next/image requires it) */}
                <Link href={`/product/${id}`} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
                    <Image
                        src={image}
                        alt=""
                        fill
                        sizes={sizes}
                        loading={eager ? "eager" : undefined}
                        fetchPriority={eager ? "high" : undefined}
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                </Link>

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-2">
                    {isNew && (
                        <span className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                            Yangi
                        </span>
                    )}
                    {discount > 0 && (
                        <span className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground">
                            -{discount}%
                        </span>
                    )}
                    {outOfStock && (
                        <span className="rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground">
                            Tugagan
                        </span>
                    )}
                    {badge && (
                        <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                            {badge}
                        </span>
                    )}
                </div>

                {/* Quick Actions — always visible on touch layouts and on keyboard focus */}
                <div className="absolute top-3 right-3 flex flex-col gap-2 transition-all duration-300 lg:opacity-0 lg:translate-x-2 lg:group-hover:opacity-100 lg:group-hover:translate-x-0 lg:group-focus-within:opacity-100 lg:group-focus-within:translate-x-0">
                    <Button
                        size="icon"
                        variant="secondary"
                        onClick={handleWishlist}
                        aria-pressed={inWishlist}
                        aria-label={inWishlist ? `${name} — sevimlilardan o'chirish` : `${name} — sevimlilarga qo'shish`}
                        className={cn(
                            "h-9 w-9 rounded-full backdrop-blur-sm shadow-lg transition-colors",
                            inWishlist
                                ? "bg-red-500 hover:bg-red-600 text-white"
                                : "bg-background/90 hover:bg-background"
                        )}
                    >
                        <Heart className={cn("h-4 w-4", inWishlist && "fill-current")} aria-hidden="true" />
                    </Button>
                    <Button
                        size="icon"
                        variant="secondary"
                        className="hidden lg:inline-flex h-9 w-9 rounded-full bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg"
                        asChild
                    >
                        <Link href={`/product/${id}`} aria-label={`${name} — batafsil`}>
                            <Eye className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </Button>
                </div>

                {/* Add to Cart Button */}
                <div className="absolute inset-x-3 bottom-3 transition-all duration-300 lg:opacity-0 lg:translate-y-2 lg:group-hover:opacity-100 lg:group-hover:translate-y-0 lg:group-focus-within:opacity-100 lg:group-focus-within:translate-y-0">
                    <Button
                        className="w-full rounded-xl shadow-lg"
                        size="lg"
                        onClick={handleAddToCart}
                        disabled={outOfStock}
                        aria-label={`${name} — savatga qo'shish`}
                    >
                        <ShoppingBag className="mr-2 h-4 w-4" aria-hidden="true" />
                        {outOfStock ? "Tugagan" : "Savatga"}
                    </Button>
                </div>
            </div>

            {/* Product Info */}
            <div className="mt-4 space-y-1">
                {category && (
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {category}
                    </p>
                )}
                <Link href={`/product/${id}`}>
                    <h3 className="font-medium leading-tight text-balance hover:text-muted-foreground transition-colors">
                        {name}
                    </h3>
                </Link>
                <div className="flex flex-wrap items-baseline gap-x-2 pt-1">
                    <span className="text-lg font-semibold">{formatPrice(price)}</span>
                    {originalPrice !== undefined && originalPrice > price && (
                        <span className="text-sm text-muted-foreground line-through">
                            <span className="sr-only">Avvalgi narx: </span>
                            {formatPrice(originalPrice)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
