import { cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { CategoryHeader } from "@/components/category/category-header"
import { CategoryBrowser } from "@/components/category/category-browser"
import { getCategoryBySlug, getProductFacets, getProductPage } from "@/lib/api"
import { CATALOG_PAGE_SIZE, parseCatalogParams } from "@/lib/catalog"

const categoryBanners: Record<string, string> = {
  iphone:      "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=1600&q=80",
  macbook:     "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1600&q=80",
  ipad:        "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=1600&q=80",
  watch:       "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=1600&q=80",
  airpods:     "https://images.unsplash.com/photo-1606841837239-c5a1a4a07af7?w=1600&q=80",
  accessories: "https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=1600&q=80",
}

// One fetch per request, shared by generateMetadata and the page.
const loadCategory = cache((slug: string) => getCategoryBySlug(slug))

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const category = await loadCategory(slug).catch(() => null)
  if (!category) return { title: "Kategoriya topilmadi", robots: { index: false } }
  return {
    title: category.name,
    description: `${category.name} — AppleShop'dagi original Apple mahsulotlari va narxlari.`,
    alternates: { canonical: category.href },
  }
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const category = await loadCategory(slug)
  if (!category) notFound()

  // the search box is not part of a category listing
  const filters = { ...parseCatalogParams(await searchParams), q: "" }
  const [page, facets] = await Promise.all([
    getProductPage({ ...filters, category: category.id, pageSize: CATALOG_PAGE_SIZE }),
    getProductFacets({ category: category.id }),
  ])

  const banner = categoryBanners[category.slug] ?? categoryBanners.accessories

  return (
    <>
      <Header />
      <main id="main-content" className="pt-16 lg:pt-20">
        <CategoryHeader name={category.name} banner={banner} productCount={facets.count} />
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <CategoryBrowser page={page} facets={facets} filters={filters} basePath={category.href} />
        </div>
      </main>
      <Footer />
    </>
  )
}
