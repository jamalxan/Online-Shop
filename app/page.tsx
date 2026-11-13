import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { HeroSection } from "@/components/home/hero-section"
import { CategoriesSection } from "@/components/home/categories-section"
import { BestSellersSection } from "@/components/home/best-sellers-section"
import { NewArrivalsSection } from "@/components/home/new-arrivals-section"
import { WhyChooseUsSection } from "@/components/home/why-choose-us-section"
import { NewsletterSection } from "@/components/home/newsletter-section"
import { getCategories, getProductFacets, getProductPageSafe } from "@/lib/api"
import type { Product } from "@/lib/types"

/** how many cards the catalogue block shows per tab */
const SHOWCASE_SIZE = 8
/** products standing in front of the hero photograph */
const STAGE_SIZE = 3

/** The dearest product of each category, dearest category first — the shop's flagships, never two of a kind. */
function pickFlagships(byPriceDesc: Product[], limit: number) {
    const seen = new Set<string>()
    const picked: Product[] = []
    for (const product of byPriceDesc) {
        const key = String(product.categoryId ?? product.category)
        if (seen.has(key) || !product.image) continue
        seen.add(key)
        picked.push(product)
        if (picked.length === limit) break
    }
    return picked.map(({ id, name, price, image }) => ({ id, name, price, image }))
}

export default async function HomePage() {
    // Bounded requests only (never the whole catalogue). Each one degrades to "empty" when the API
    // is unreachable, and the sections then hide themselves.
    const [latest, dearest, facets, categories] = await Promise.all([
        getProductPageSafe({ pageSize: SHOWCASE_SIZE }),                 // newest first
        getProductPageSafe({ sort: "price_desc", pageSize: 12 }),        // flagships for the hero
        getProductFacets(),                                              // lowest price
        getCategories(),
    ])

    return (
        <>
            <Header />
            <main id="main-content">
                <HeroSection
                    minPrice={facets.minPrice ?? undefined}
                    stageProducts={pickFlagships(dearest.results, STAGE_SIZE)}
                />
                <CategoriesSection />
                <BestSellersSection
                    products={latest.results}
                    categories={categories.filter((c) => (c.productsCount ?? 0) > 0)}
                    pageSize={SHOWCASE_SIZE}
                />
                <NewArrivalsSection products={latest.results} />
                {/* Removed from the page: invented reviews, instalment plans, trade-in and price-match
                    offers — none of them exist in the shop's system (see SETUP.md → "Kontent"). */}
                <WhyChooseUsSection />
                <NewsletterSection />
            </main>
            <Footer />
        </>
    )
}