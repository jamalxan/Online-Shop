import Link from "next/link"
import Image from "next/image"
import { ArrowRight, BadgeCheck, Eye, Truck, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice, type Currency } from "@/lib/utils"

const BADGES = [
  { icon: BadgeCheck, text: "Original mahsulotlar" },
  { icon: Wallet, text: "To'lov qabul qilganda" },
  { icon: Truck, text: "Yetkazib berish yoki olib ketish" },
  { icon: Eye, text: "Buyurtmani onlayn kuzatish" },
]

/** `productCount` and `minPrice` come from the live catalogue — nothing in the hero is a made-up number. */
export function HeroSection({ productCount = 0, minPrice, currency }: { productCount?: number; minPrice?: number; currency: Currency }) {
  return (
    <section className="relative overflow-hidden bg-background pt-20">
      <div className="absolute inset-0 bg-gradient-to-b from-secondary/50 to-background" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center pt-12 pb-20 lg:pt-20 lg:pb-32">
          {productCount > 0 && (
            <p className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium tracking-wide shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Katalogda {productCount} ta mahsulot sotuvda
            </p>
          )}

          <h1 className="mt-8 text-center font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl leading-[1.1] tracking-tight text-balance">
            Original Apple texnikasi
            <br />
            <span className="text-muted-foreground">bir joyda</span>
          </h1>

          <p className="mt-6 max-w-xl text-center text-lg text-muted-foreground leading-relaxed text-pretty">
            iPhone, MacBook, AirPods va Apple Watch. Buyurtma bering, holatini onlayn kuzating,
            to&apos;lovni mahsulotni qabul qilganda amalga oshiring.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <Button size="lg" className="min-w-[200px] rounded-full" asChild>
              <Link href="/products">
                Katalogni ko&apos;rish
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="min-w-[200px] rounded-full" asChild>
              <Link href="/faq">Qanday buyurtma beriladi?</Link>
            </Button>
          </div>

          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
            {BADGES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-16 w-full max-w-4xl">
            <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-secondary shadow-2xl">
              <Image
                src="https://images.unsplash.com/photo-1616348436168-de43ad0db179?w=1200&q=80"
                alt="Smartfonning orqa kamerasi yaqindan"
                fill
                sizes="(max-width: 896px) 100vw, 896px"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent" aria-hidden="true" />
              {minPrice !== undefined && minPrice > 0 && (
                <div className="absolute bottom-6 left-6 rounded-2xl bg-background/90 px-4 py-3 shadow-lg backdrop-blur-xl">
                  <p className="text-xs text-muted-foreground">Narxlar</p>
                  <p className="font-semibold">{formatPrice(minPrice, currency)} dan boshlab</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
