import Link from "next/link"
import { ShoppingBag, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CartEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary">
        <ShoppingBag className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold">Savatingiz bo'sh</h2>
      <p className="mt-2 max-w-sm text-muted-foreground">
        Hali hech narsa qo'shmagansiz. Katalogni ko'rib chiqing.
      </p>
      <Button className="mt-8 rounded-full" size="lg" asChild>
        <Link href="/products">
          Xaridni boshlash
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  )
}
