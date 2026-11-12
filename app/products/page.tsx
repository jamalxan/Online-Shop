import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { CategoryBrowser } from "@/components/category/category-browser"
import { getProductFacets, getProductPage } from "@/lib/api"
import { CATALOG_PAGE_SIZE, parseCatalogParams } from "@/lib/catalog"

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { q } = parseCatalogParams(await searchParams)
  return q
    ? { title: `"${q}" bo'yicha qidiruv`, robots: { index: false } }
    : {
        title: "Barcha mahsulotlar",
        description: "APEX Store'dagi barcha Apple mahsulotlari: iPhone, MacBook, AirPods, Apple Watch va aksessuarlar.",
        alternates: { canonical: "/products" },
      }
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const filters = parseCatalogParams(await searchParams)
  const { q } = filters
  // one page of results; filtering, sorting and paging happen in the API
  const [page, facets] = await Promise.all([
    getProductPage({ ...filters, pageSize: CATALOG_PAGE_SIZE }),
    getProductFacets({ q }),
  ])

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen pt-24 pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
            <Link href="/" className="hover:text-foreground transition-colors">Bosh sahifa</Link>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            <span className="text-foreground" aria-current="page">{q ? "Qidiruv" : "Barcha mahsulotlar"}</span>
          </nav>

          <h1 className="font-serif text-3xl sm:text-4xl">
            {q ? <>&ldquo;{q}&rdquo; bo'yicha natijalar</> : "Barcha mahsulotlar"}
          </h1>

          <div className="mt-8">
            <CategoryBrowser page={page} facets={facets} filters={filters} basePath="/products" />
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
