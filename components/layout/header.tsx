"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Search, ShoppingBag, Heart, User, Menu, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, formatPrice } from "@/lib/utils"
import { useStore } from "@/lib/store-context"
import { searchProducts } from "@/lib/api"
import type { Product } from "@/lib/types"

const SEARCH_DEBOUNCE_MS = 350
const MAX_SUGGESTIONS = 6

export function Header() {
  const router = useRouter()
  const { cartCount, categories } = useStore()

  // Real categories from the API (plus the full catalogue link)
  const navigation = [
    ...categories.map((c) => ({ name: c.name, href: c.href })),
    { name: "Barcha mahsulotlar", href: "/products" },
  ]

  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // Search state
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const cancelPendingSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const closeSearch = useCallback(() => {
    cancelPendingSearch()
    setIsSearchOpen(false)
    setQuery("")
    setResults([])
    setSearching(false)
  }, [cancelPendingSearch])

  // ESC closes overlays; lock page scroll while one is open
  const overlayOpen = isSearchOpen || isMobileMenuOpen
  useEffect(() => {
    if (!overlayOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      closeSearch()
      setIsMobileMenuOpen(false)
    }
    window.addEventListener("keydown", handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [overlayOpen, closeSearch])

  useEffect(() => {
    if (isSearchOpen) inputRef.current?.focus()
  }, [isSearchOpen])

  useEffect(() => cancelPendingSearch, [cancelPendingSearch])

  // Debounced search; stale responses are aborted so they can never overwrite newer ones
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    cancelPendingSearch()

    const term = value.trim()
    if (!term) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      const data = await searchProducts(term, controller.signal)
      if (controller.signal.aborted) return
      setResults(data.slice(0, MAX_SUGGESTIONS))
      setSearching(false)
    }, SEARCH_DEBOUNCE_MS)
  }, [cancelPendingSearch])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const term = query.trim()
    if (!term) return
    closeSearch()
    router.push(`/products?q=${encodeURIComponent(term)}`)
  }

  const logo = (
    <Link href="/" className="flex items-center gap-2" aria-label="APEX Store — bosh sahifa">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground">
        <span className="text-sm font-bold text-background" aria-hidden="true">A</span>
      </div>
      <span className="text-lg font-semibold tracking-tight">APEX</span>
    </Link>
  )

  return (
      <>
        <header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
                isScrolled
                    ? "bg-background/80 backdrop-blur-xl border-b border-border shadow-sm"
                    : "bg-transparent"
            )}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between lg:h-20">
              {logo}

              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center gap-8" aria-label="Kategoriyalar">
                {navigation.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.name}
                    </Link>
                ))}
              </nav>

              {/* Actions */}
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSearchOpen(true)}
                    aria-label="Qidiruv"
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" className="hidden sm:flex" asChild>
                  <Link href="/wishlist" aria-label="Sevimlilar">
                    <Heart className="h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" className="hidden sm:flex" asChild>
                  <Link href="/account" aria-label="Hisob">
                    <User className="h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" className="relative" asChild>
                  <Link href="/cart" aria-label={cartCount > 0 ? `Savat, ${cartCount} ta mahsulot` : "Savat"}>
                    <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                    {cartCount > 0 && (
                        <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-0.5 text-[10px] font-medium text-background"
                        >
                          {cartCount > 99 ? "99+" : cartCount}
                        </span>
                    )}
                  </Link>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    onClick={() => setIsMobileMenuOpen(true)}
                    aria-label="Menyuni ochish"
                    aria-expanded={isMobileMenuOpen}
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Menu — unmounted from the a11y tree and tab order while closed */}
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Menyu"
            inert={!isMobileMenuOpen}
            className={cn(
                "fixed inset-0 z-50 overflow-y-auto bg-background transition-transform duration-300 lg:hidden",
                isMobileMenuOpen ? "translate-x-0" : "translate-x-full invisible"
            )}
        >
          <div className="flex h-16 items-center justify-between px-4">
            {logo}
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)} aria-label="Menyuni yopish">
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
          <nav className="flex flex-col gap-1 px-4 pt-8 pb-10" aria-label="Kategoriyalar">
            {navigation.map((item) => (
                <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center py-4 text-2xl font-medium border-b border-border"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
            ))}
            <div className="flex items-center gap-4 pt-8">
              <Button variant="outline" size="lg" className="flex-1" asChild>
                <Link href="/account" onClick={() => setIsMobileMenuOpen(false)}>
                  <User className="mr-2 h-4 w-4" aria-hidden="true" />
                  Hisob
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="flex-1" asChild>
                <Link href="/wishlist" onClick={() => setIsMobileMenuOpen(false)}>
                  <Heart className="mr-2 h-4 w-4" aria-hidden="true" />
                  Sevimlilar
                </Link>
              </Button>
            </div>
          </nav>
        </div>

        {/* Search Modal */}
        {isSearchOpen && (
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Mahsulot qidirish"
                className="fixed inset-0 z-50 overflow-y-auto bg-background/95 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={closeSearch}
            >
              <div
                  className="mx-auto max-w-2xl px-4 pt-24 pb-10"
                  onClick={(e) => e.stopPropagation()}
              >
                <form onSubmit={handleSearchSubmit} role="search" className="relative">
                  {searching ? (
                      <Loader2 className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground animate-spin" aria-hidden="true" />
                  ) : (
                      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  )}
                  <input
                      ref={inputRef}
                      type="search"
                      name="q"
                      value={query}
                      onChange={(e) => handleQueryChange(e.target.value)}
                      placeholder="Mahsulot qidirish..."
                      aria-label="Mahsulot qidirish"
                      autoComplete="off"
                      maxLength={100}
                      className="w-full rounded-xl border border-border bg-card py-4 pl-12 pr-12 text-lg outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
                  />
                  <button
                      type="button"
                      onClick={() => (query ? handleQueryChange("") : closeSearch())}
                      aria-label={query ? "Tozalash" : "Qidiruvni yopish"}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </form>

                {/* Results */}
                {results.length > 0 && (
                    <ul className="mt-2 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                      {results.map((product) => (
                          <li key={product.id} className="border-b border-border last:border-0">
                            <Link
                                href={`/product/${product.id}`}
                                onClick={closeSearch}
                                className="flex w-full items-center gap-4 px-4 py-3 hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none transition-colors text-left"
                            >
                              <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-secondary">
                                <Image
                                    src={product.image}
                                    alt=""
                                    fill
                                    sizes="48px"
                                    className="object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{product.name}</p>
                                <p className="text-sm text-muted-foreground">{formatPrice(product.price)}</p>
                              </div>
                            </Link>
                          </li>
                      ))}
                      <li>
                        <button
                            type="button"
                            onClick={handleSearchSubmit}
                            className="w-full px-4 py-3 text-sm font-medium text-left hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none transition-colors"
                        >
                          Barcha natijalarni ko'rish
                        </button>
                      </li>
                    </ul>
                )}

                <p className="mt-4 text-center text-sm text-muted-foreground" aria-live="polite">
                  {!searching && query.trim() && results.length === 0
                      ? `"${query.trim()}" bo'yicha hech narsa topilmadi`
                      : !query
                          ? "Yopish uchun ESC tugmasini bosing"
                          : ""}
                </p>
              </div>
            </div>
        )}
      </>
  )
}
