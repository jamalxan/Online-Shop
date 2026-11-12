import { cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { ProductView } from "@/components/product/product-view"
import { ProductTabs } from "@/components/product/product-tabs"
import { RelatedProducts } from "@/components/product/related-products"
import { categorySlug, getProductById, getRelatedProducts, getStoreInfo } from "@/lib/api"
import { formatPrice, toCurrency } from "@/lib/utils"

// One fetch per request, shared by generateMetadata and the page.
const loadProduct = cache((id: string) => getProductById(id))

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  // A failing API must not break metadata; the page itself shows the error boundary.
  const product = await loadProduct(id).catch(() => null)
  if (!product) return { title: "Mahsulot topilmadi", robots: { index: false } }

  // a server component has no StoreProvider above it: the shop currency is passed explicitly
  const { currency } = await getStoreInfo()
  const description =
    product.description?.replace(/\s+/g, " ").trim().slice(0, 160) ||
    `${product.name} — ${formatPrice(product.price, toCurrency(currency))}. APEX Store'da xarid qiling.`

  return {
    title: product.name,
    description,
    alternates: { canonical: `/product/${product.id}` },
    openGraph: {
      title: product.name,
      description,
      type: "website",
      images: product.image.startsWith("http") ? [{ url: product.image, alt: product.name }] : undefined,
    },
  }
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params
  const product = await loadProduct(id)
  if (!product) notFound()

  const related = await getRelatedProducts(product)
  const categoryHref = product.category
    ? `/category/${categorySlug(product.category, product.categoryId)}`
    : undefined

  return (
    <>
      <Header />
      <main id="main-content" className="pt-16 lg:pt-20">
        <ProductView product={product} categoryHref={categoryHref} />
        <ProductTabs
          description={product.description}
          storageOptions={product.storageOptions ?? []}
          colorVariants={product.colorVariants ?? []}
          category={product.category}
        />
        <RelatedProducts products={related} categoryHref={categoryHref} />
      </main>
      <Footer />
    </>
  )
}
