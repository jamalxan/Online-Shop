import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Sahifa topilmadi",
  robots: { index: false },
}

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main-content" className="flex min-h-[70vh] flex-col items-center justify-center px-4 pt-24 pb-20 text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">404</p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Sahifa topilmadi</h1>
        <p className="mt-4 max-w-md text-muted-foreground">
          Siz qidirgan sahifa mavjud emas yoki ko'chirilgan.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="rounded-xl" size="lg">
            <Link href="/">Bosh sahifa</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl" size="lg">
            <Link href="/products">Barcha mahsulotlar</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </>
  )
}
