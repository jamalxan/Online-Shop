import type { CSSProperties } from "react"
import Link from "next/link"
import { ArrowRight, BadgeCheck, Eye, Truck, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HeroStage, type StageProduct } from "@/components/home/hero-stage"
import type { Currency } from "@/lib/utils"

const BADGES = [
  { icon: BadgeCheck, text: "Original mahsulotlar" },
  { icon: Wallet, text: "To'lov qabul qilganda" },
  { icon: Truck, text: "Yetkazib berish yoki olib ketish" },
  { icon: Eye, text: "Buyurtmani onlayn kuzatish" },
]

/** order in the hero's load sequence (see `[data-rise]` and `.hero-line` in globals.css) */
const step = (index: number) => ({ "--i": index }) as CSSProperties

interface HeroSectionProps {
  /** lowest price in the live catalogue — nothing in the hero is a made-up number */
  minPrice?: number
  currency: Currency
  /** real products shown in front of the photograph */
  stageProducts?: StageProduct[]
}

export function HeroSection({ minPrice, currency, stageProducts = [] }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-background pt-20">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center pt-12 pb-24 lg:pt-20 lg:pb-36">
          {/* Each line rises out of its own mask, tipping up from the baseline.
              On phones the size follows the screen width so the first line never breaks in two
              (it is 10.1em wide in Playfair Display): two lines at 320px and up, not three. */}
          <h1 className="text-center font-serif text-[clamp(1.75rem,8.6vw,2.25rem)] sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl leading-[1.1] tracking-tight">
            <span className="hero-line">
              <span className="hero-line__text" style={step(0)}>Original Apple texnikasi</span>
            </span>{" "}
            <span className="hero-line">
              <span className="hero-line__text text-muted-foreground" style={step(1)}>bir joyda</span>
            </span>
          </h1>

          <p data-rise="solid" style={step(2)} className="mt-6 max-w-xl text-center text-lg text-muted-foreground leading-relaxed text-pretty">
            iPhone, MacBook, AirPods va Apple Watch. Buyurtma bering, holatini onlayn kuzating,
            to&apos;lovni mahsulotni qabul qilganda amalga oshiring.
          </p>

          <div data-rise style={step(3)} className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <Button size="lg" className="press min-w-[200px] rounded-full" asChild>
              <Link href="/products">
                Katalogni ko&apos;rish
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="press min-w-[200px] rounded-full" asChild>
              <Link href="/faq">Qanday buyurtma beriladi?</Link>
            </Button>
          </div>

          <ul data-rise style={step(4)} className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
            {BADGES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <HeroStage products={stageProducts} minPrice={minPrice} currency={currency} />
        </div>
      </div>
    </section>
  )
}
