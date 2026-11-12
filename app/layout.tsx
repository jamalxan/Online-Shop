import type { Metadata, Viewport } from "next"
import { Inter, Playfair_Display } from "next/font/google"
import "./globals.css"
import { StoreProvider } from "@/lib/store-context"
import { getCategories, getStoreInfo } from "@/lib/api"

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
})

const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  variable: "--font-playfair",
  display: "swap",
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: "APEX Store | Original Apple mahsulotlari",
    template: "%s | APEX Store",
  },
  description:
      "Original Apple mahsulotlari: iPhone, MacBook, iPad, Apple Watch, AirPods va aksessuarlar.",
  keywords: [
    "Apple",
    "iPhone",
    "MacBook",
    "iPad",
    "Apple Watch",
    "AirPods",
    "original Apple mahsulotlari",
  ],
  openGraph: {
    type: "website",
    siteName: "APEX Store",
    locale: "uz_UZ",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1A1A" },
  ],
  width: "device-width",
  initialScale: 1,
}

export default async function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode
}>) {
  // Cached for 60s; returns [] when the API is unreachable (header falls back to defaults).
  // Both are public, cached requests — fetched in parallel so the layout never waits twice.
  const [categories, store] = await Promise.all([getCategories(), getStoreInfo()])

  return (
      <html lang="uz" className={`${inter.variable} ${playfair.variable}`}>
      <body className="font-sans antialiased">
      <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:text-background"
      >
        Asosiy kontentga o'tish
      </a>
      <StoreProvider initialCategories={categories} initialStore={store}>
        {children}
      </StoreProvider>
      </body>
      </html>
  )
}
