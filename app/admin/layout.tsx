"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  CreditCard, LayoutDashboard, Loader2, LogOut, Mail, Menu, Moon, Package, Settings,
  ShoppingCart, Store, Sun, Tag, Users, X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn, pinActiveCurrency } from "@/lib/utils"
import { adminGetCounters, fetchStoreInfoFresh } from "@/lib/api"
import { useStore } from "@/lib/store-context"
import type { AdminCounters } from "@/lib/types"

const LOGIN_PATH = "/admin/login"
const COUNTERS_REFRESH_MS = 60_000

type NavItem = { href: string; label: string; icon: LucideIcon; counter?: keyof AdminCounters }

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Umumiy", items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Savdo",
    items: [
      { href: "/admin/orders", label: "Buyurtmalar", icon: ShoppingCart, counter: "pending_orders" },
      { href: "/admin/payments", label: "To'lovlar", icon: CreditCard, counter: "payments_review" },
      { href: "/admin/customers", label: "Mijozlar", icon: Users },
    ],
  },
  {
    title: "Katalog",
    items: [
      { href: "/admin/products", label: "Mahsulotlar", icon: Package },
      { href: "/admin/categories", label: "Kategoriyalar", icon: Tag },
    ],
  },
  {
    title: "Tizim",
    items: [
      { href: "/admin/messages", label: "Murojaatlar", icon: Mail, counter: "unread_messages" },
      { href: "/admin/settings", label: "Sozlamalar", icon: Settings },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}`))
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, authReady, logout } = useStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [counters, setCounters] = useState<AdminCounters | null>(null)
  const [currencyReady, setCurrencyReady] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const isLoginPage = pathname === LOGIN_PATH
  // `is_staff` comes from /api/profile/ (read-only). This gate only hides the UI —
  // every /api/admin/* endpoint is authorised by the backend itself.
  const isStaff = Boolean(user?.is_staff)

  useEffect(() => {
    if (isLoginPage || !authReady) return
    if (!isStaff) router.replace(LOGIN_PATH)
  }, [isLoginPage, authReady, isStaff, router])

  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem("theme") } catch { /* storage unavailable */ }
    if (saved === "light" || saved === "dark") {
      setTheme(saved)
      document.documentElement.classList.toggle("dark", saved === "dark")
    }
    // the dark class must not leak into the storefront
    return () => document.documentElement.classList.remove("dark")
  }, [])

  // Work-queue badges: refreshed on navigation, every minute, and when the tab becomes visible again.
  const refreshCounters = useCallback(async () => {
    const res = await adminGetCounters()
    if (res.ok) setCounters(res.data)
  }, [])

  useEffect(() => {
    if (isLoginPage || !isStaff) return
    void refreshCounters()
    const timer = setInterval(() => { if (!document.hidden) void refreshCounters() }, COUNTERS_REFRESH_MS)
    const onVisible = () => { if (!document.hidden) void refreshCounters() }
    document.addEventListener("visibilitychange", onVisible)
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible) }
  }, [isLoginPage, isStaff, pathname, refreshCounters])

  // Mobile drawer: focus moves into it when it opens, Esc closes it, focus returns to the menu button.
  useEffect(() => {
    if (!sidebarOpen) return
    const menuButton = menuButtonRef.current
    closeButtonRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false) }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      menuButton?.focus()
    }
  }, [sidebarOpen])

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light"
    setTheme(next)
    try { localStorage.setItem("theme", next) } catch { /* ignore */ }
    document.documentElement.classList.toggle("dark", next === "dark")
  }

  const handleLogout = () => {
    logout()
    router.replace(LOGIN_PATH)
  }

  // Prices are typed and read in the shop currency. The storefront's copy of that setting comes
  // from a page cache (up to a minute old); the admin panel reads it fresh before showing any price.
  useEffect(() => {
    if (isLoginPage || !isStaff) return
    let cancelled = false
    void fetchStoreInfoFresh().then((info) => {
      if (cancelled) return
      if (info) pinActiveCurrency(info.currency)
      setCurrencyReady(true) // on a network error the cached value is used
    })
    return () => { cancelled = true }
  }, [isLoginPage, isStaff])

  // The login page renders without the admin chrome and without the guard (no redirect loop).
  if (isLoginPage) return <>{children}</>

  // Nothing admin-related is rendered until the profile says the user is staff.
  if (!authReady || !isStaff || !currencyReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Tekshirilmoqda…</span>
      </div>
    )
  }

  const current = ALL_ITEMS.find((item) => item.href !== "/admin" && isActive(pathname, item.href))
  const initial = (user?.first_name || user?.email || "A").charAt(0).toUpperCase()

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card text-foreground duration-300 motion-reduce:transition-none",
          "lg:visible lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          // A closed drawer is `invisible` on phones, so its links leave the tab order and the accessibility
          // tree. Visibility is animated only while closing (hidden after the slide); on opening it flips at
          // once, otherwise the close button could not take focus on the first frame.
          sidebarOpen ? "visible translate-x-0 transition-[translate]" : "invisible -translate-x-full transition-[translate,visibility]",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <Link href="/admin" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground font-serif text-lg font-bold text-background" aria-hidden="true">A</span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight">AppleShop</span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Boshqaruv</span>
            </span>
          </Link>
          <button type="button" className="rounded-lg p-2 hover:bg-secondary lg:hidden focus-visible:outline-2 focus-visible:outline-foreground" onClick={() => setSidebarOpen(false)} aria-label="Menyuni yopish" ref={closeButtonRef}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Admin menyu">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{group.title}</p>
              <ul className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon, counter }) => {
                  const active = isActive(pathname, href)
                  const count = counter ? counters?.[counter] ?? 0 : 0
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setSidebarOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
                          active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1">{label}</span>
                        {count > 0 && (
                          <span className={cn(
                            "min-w-6 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums",
                            active ? "bg-background text-foreground" : "bg-foreground text-background",
                          )}>
                            {count > 99 ? "99+" : count}
                            <span className="sr-only"> ta kutilmoqda</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background" aria-hidden="true">{initial}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{user?.first_name || "Admin"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email || ""}</p>
            </div>
            <button type="button" onClick={handleLogout} className="shrink-0 rounded-lg p-2 hover:bg-background focus-visible:outline-2 focus-visible:outline-foreground" aria-label="Chiqish" title="Chiqish">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <Link href="/" className="flex min-h-9 items-center justify-center gap-2 rounded-xl border border-border text-xs text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-foreground">
            <Store className="h-3.5 w-3.5" aria-hidden="true" />
            Do&apos;konni ochish
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-xl p-2 hover:bg-secondary lg:hidden focus-visible:outline-2 focus-visible:outline-foreground" onClick={() => setSidebarOpen(true)} aria-label="Menyuni ochish" aria-expanded={sidebarOpen} ref={menuButtonRef}>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <p className="text-sm text-muted-foreground">
              <Link href="/admin" className="rounded hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground">Admin</Link>
              {current && <><span className="mx-2" aria-hidden="true">/</span><span className="text-foreground">{current.label}</span></>}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish"}
            className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-foreground"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>
        </header>

        <main id="main-content" className="flex-1 p-4 sm:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
