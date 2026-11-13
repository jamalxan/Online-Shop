import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BadgeCheck, ClipboardList, PackageCheck, ShoppingBag, Truck, Wallet } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Button } from "@/components/ui/button"
import { getCategories, getProductFacets } from "@/lib/api"

export const metadata: Metadata = {
  title: "Biz haqimizda",
  description: "AppleShop — original Apple mahsulotlari onlayn do'koni: iPhone, MacBook, AirPods, Apple Watch va aksessuarlar.",
}

// No invented history, awards, certificates or customer counts: this page states what the shop
// sells and how an order works. The two numbers shown below are counted from the live catalogue.
const principles = [
  { icon: BadgeCheck, title: "Original mahsulotlar", text: "Katalogda faqat original Apple qurilmalari va aksessuarlari." },
  { icon: Wallet, title: "Ochiq narx", text: "Variant va chegirma hisobga olingan yakuniy narx mahsulot sahifasida ko'rsatiladi." },
  { icon: Truck, title: "Qulay yetkazib berish", text: "Standart, tezkor yoki do'kondan olib ketish — o'zingiz tanlaysiz." },
]

const steps = [
  { icon: ShoppingBag, title: "Tanlang", text: "Mahsulot, xotira hajmi va rangini belgilab, savatga qo'shing." },
  { icon: ClipboardList, title: "Rasmiylashtiring", text: "Aloqa ma'lumotlari va yetkazib berish usulini kiriting." },
  { icon: Truck, title: "Kuzating", text: "Buyurtma holati “Buyurtmalarim” sahifasida va emailda yangilanadi." },
  { icon: PackageCheck, title: "Qabul qiling", text: "Mahsulotni tekshirib oling va to'lovni shu paytda amalga oshiring." },
]

export default async function AboutPage() {
  const [facets, categories] = await Promise.all([getProductFacets(), getCategories()])
  return (
    <>
      <Header />
      <main id="main-content" className="bg-background pt-20">
        <section className="bg-secondary/50 py-20 sm:py-28">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Biz haqimizda</p>
            <h1 className="mt-4 font-serif text-4xl text-balance sm:text-5xl lg:text-6xl">
              Original Apple texnikasi uchun onlayn do&apos;kon
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              AppleShop — iPhone, MacBook, AirPods, Apple Watch va aksessuarlarni bir joyda tanlash,
              buyurtma berish va qabul qilganda to&apos;lash mumkin bo&apos;lgan do&apos;kon.
            </p>
            {facets.count > 0 && (
              <dl className="mx-auto mt-10 grid max-w-md grid-cols-2 gap-6">
                <div>
                  <dd className="font-serif text-4xl">{facets.count}</dd>
                  <dt className="mt-1 text-sm text-muted-foreground">mahsulot katalogda</dt>
                </div>
                <div>
                  <dd className="font-serif text-4xl">{categories.length}</dd>
                  <dt className="mt-1 text-sm text-muted-foreground">kategoriya</dt>
                </div>
              </dl>
            )}
          </div>
        </section>

        <section className="py-16 sm:py-24" aria-labelledby="principles-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 id="principles-title" className="text-center font-serif text-3xl sm:text-4xl">Nimaga amal qilamiz</h2>
            <ul className="mt-12 grid gap-8 md:grid-cols-3">
              {principles.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-2xl border border-border bg-card p-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-secondary/30 py-16 sm:py-24" aria-labelledby="steps-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 id="steps-title" className="text-center font-serif text-3xl sm:text-4xl">Buyurtma qanday ishlaydi</h2>
            <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(({ icon: Icon, title, text }, index) => (
                <li key={title} className="rounded-2xl bg-background p-8 shadow-sm">
                  <div className="flex items-center justify-between">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                    <span className="font-serif text-3xl text-muted-foreground" aria-hidden="true">{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="font-serif text-3xl sm:text-4xl">Savolingiz bormi?</h2>
            <p className="mt-4 text-muted-foreground">Kafolat, yetkazib berish muddati yoki mahsulot tanlash bo&apos;yicha yozing.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" className="rounded-full px-8" asChild>
                <Link href="/products">Katalogni ko&apos;rish<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-8" asChild>
                <Link href="/contact">Bog&apos;lanish</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
