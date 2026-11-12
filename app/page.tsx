import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { HeroSection } from "@/components/home/hero-section"
import { CategoriesSection } from "@/components/home/categories-section"
import { BestSellersSection } from "@/components/home/best-sellers-section"
import { NewArrivalsSection } from "@/components/home/new-arrivals-section"
import { WhyChooseUsSection } from "@/components/home/why-choose-us-section"
import { NewsletterSection } from "@/components/home/newsletter-section"
import { getCategories, getProductFacets, getProductPageSafe, getStoreInfo } from "@/lib/api"
import { toCurrency } from "@/lib/utils"

/** how many cards the catalogue block shows per tab */
const SHOWCASE_SIZE = 8

export default async function HomePage() {
    // Bounded requests only (never the whole catalogue). Each one degrades to "empty" when the API
    // is unreachable, and the sections then hide themselves.
    const [latest, facets, categories, store] = await Promise.all([
        getProductPageSafe({ pageSize: SHOWCASE_SIZE }), // newest first
        getProductFacets(),                              // total and lowest price
        getCategories(),
        getStoreInfo(),
    ])

    return (
        <>
            <Header />
            <main id="main-content">
                <HeroSection productCount={facets.count} minPrice={facets.minPrice ?? undefined} currency={toCurrency(store.currency)} />
                <CategoriesSection />
                <BestSellersSection
                    products={latest.results}
                    categories={categories.filter((c) => (c.productsCount ?? 0) > 0)}
                    pageSize={SHOWCASE_SIZE}
                />
                <NewArrivalsSection products={latest.results.slice(0, 6)} />
                {/* Removed from the page: invented reviews, instalment plans, trade-in and price-match
                    offers — none of them exist in the shop's system (see SETUP.md → "Kontent"). */}
                <WhyChooseUsSection />
                <NewsletterSection />
            </main>
            <Footer />
        </>
    )
}