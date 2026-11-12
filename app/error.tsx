"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-3xl sm:text-4xl">Xatolik yuz berdi</h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        Sahifani yuklab bo'lmadi. Internet aloqasini tekshirib, qayta urinib ko'ring.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button className="rounded-xl" size="lg" onClick={() => reset()}>
          Qayta urinish
        </Button>
        <Button asChild variant="outline" className="rounded-xl" size="lg">
          <Link href="/">Bosh sahifa</Link>
        </Button>
      </div>
    </main>
  )
}
