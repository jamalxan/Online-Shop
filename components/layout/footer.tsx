"use client"

import Link from "next/link"
import { Mail, Phone, MapPin, Instagram, Send } from "lucide-react"
import { useStore } from "@/lib/store-context"

// Only pages that actually exist are linked here.
const supportLinks = [
  { name: "Bog'lanish", href: "/contact" },
  { name: "Savol-javoblar", href: "/faq" },
  { name: "Buyurtmalarim", href: "/account/orders" },
]

const companyLinks = [
  { name: "Biz haqimizda", href: "/about" },
  { name: "Barcha mahsulotlar", href: "/products" },
]

/** Links are rendered as href — accept http(s) only, whatever the API returned. */
function safeLink(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export function Footer() {
  const { categories, store } = useStore()
  // No online gateway: pay on delivery, or by card transfer when the shop has published a card.
  const paymentMethods = ["Naqd pul", "Karta (qabul qilganda)", ...(store.card_payment ? ["Kartaga o'tkazma"] : [])]
  const shopLinks = categories.map((c) => ({ name: c.name, href: c.href }))

  return (
    <footer className="bg-foreground text-background">
      {/* Main Footer */}
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2" aria-label="APEX Store — bosh sahifa">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background">
                <span className="text-base font-bold text-foreground">A</span>
              </div>
              <span className="text-xl font-semibold tracking-tight">APEX</span>
            </Link>
            <p className="mt-6 max-w-sm text-background/70 leading-relaxed">
              Original Apple mahsulotlari: iPhone, MacBook, AirPods, Apple Watch va aksessuarlar. 
              
            </p>
            {/* Contact details come from the admin panel; an empty field is simply not rendered. */}
            <div className="mt-8 space-y-3">
              {store.phone && (
                <a
                  href={`tel:${store.phone.replace(/[^\d+]/g, "")}`}
                  className="flex items-center gap-3 text-background/70 hover:text-background transition-colors"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  <span>{store.phone}</span>
                </a>
              )}
              {store.email && (
                <a
                  href={`mailto:${store.email}`}
                  className="flex items-center gap-3 text-background/70 hover:text-background transition-colors"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  <span>{store.email}</span>
                </a>
              )}
              {store.address && (
                <p className="flex items-center gap-3 text-background/70">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{store.address}</span>
                </p>
              )}
              {store.working_hours && <p className="text-sm text-background/50">{store.working_hours}</p>}
            </div>
          </div>

          {/* Links */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider">Katalog</h2>
            <ul className="mt-6 space-y-3">
              {shopLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-background/70 hover:text-background transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider">Yordam</h2>
            <ul className="mt-6 space-y-3">
              {supportLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-background/70 hover:text-background transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider">Kompaniya</h2>
            <ul className="mt-6 space-y-3">
              {companyLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-background/70 hover:text-background transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-background/10 pt-8 md:flex-row">
          <div className="flex items-center gap-4">
            {safeLink(store.instagram_url) && (
              <a
                href={store.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-background/10 hover:bg-background/20 transition-colors"
              >
                <Instagram className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Instagram</span>
              </a>
            )}
            {safeLink(store.telegram_url) && (
              <a
                href={store.telegram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-background/10 hover:bg-background/20 transition-colors"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Telegram</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-3">
            {paymentMethods.map((method) => (
              <div
                key={method}
                className="flex h-8 items-center justify-center rounded bg-background/10 px-3 text-xs font-medium"
              >
                {method}
              </div>
            ))}
          </div>

          <p className="text-sm text-background/50">
            © {new Date().getFullYear()} {store.store_name}. Barcha huquqlar himoyalangan.
          </p>
        </div>
      </div>
    </footer>
  )
}
