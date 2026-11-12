"use client"

import { useId, useState } from "react"
import { Mail, CheckCircle, ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { subscribeNewsletter } from "@/lib/api"

export function NewsletterSection() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle")
  const [error, setError] = useState("")
  const inputId = useId()
  const errorId = `${inputId}-error`

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = email.trim()
    if (status === "loading") return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("To'g'ri email manzil kiriting, masalan: ism@example.com")
      return
    }
    setStatus("loading")
    setError("")
    // Saved on the server (POST /api/newsletter/) — the admin sees it under “Murojaatlar → Obunachilar”.
    const res = await subscribeNewsletter(value)
    if (!res.ok) {
      setStatus("idle")
      setError(res.error)
      return
    }
    setStatus("done")
  }

  return (
    <section className="py-16 sm:py-24 bg-foreground text-background" aria-labelledby={`${inputId}-title`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          {status === "done" ? (
            <div className="flex flex-col items-center gap-4" role="status">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                <CheckCircle className="h-8 w-8 text-green-400" aria-hidden="true" />
              </div>
              <h2 id={`${inputId}-title`} className="font-serif text-2xl sm:text-3xl">Obuna bo&apos;ldingiz</h2>
              <p className="text-background/70">
                Yangi mahsulotlar va chegirmalar haqida shu manzilga xabar beramiz.
              </p>
            </div>
          ) : (
            <>
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-background/10">
                <Mail className="h-7 w-7" aria-hidden="true" />
              </div>
              <h2 id={`${inputId}-title`} className="font-serif text-2xl sm:text-3xl lg:text-4xl">
                Yangiliklardan birinchi bo&apos;lib xabardor bo&apos;ling
              </h2>
              <p className="mt-4 text-background/70">
                Yangi mahsulotlar va chegirmalar haqida emailga xabar yuboramiz. Xohlagan payt obunani bekor qilishingiz mumkin.
              </p>

              <form onSubmit={handleSubmit} className="mt-8" noValidate>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                  <label htmlFor={inputId} className="sr-only">Email manzilingiz</label>
                  <Input
                    id={inputId}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="ism@example.com"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); setError("") }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className="h-12 border-background/20 bg-background/10 text-background placeholder:text-background/50 focus:border-background/40 focus:ring-background/20 sm:w-80"
                  />
                  <Button
                    type="submit"
                    disabled={status === "loading"}
                    className="h-12 bg-background text-foreground hover:bg-background/90 px-8"
                  >
                    {status === "loading" ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Yuborilmoqda</>
                    ) : (
                      <>Obuna bo&apos;lish<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></>
                    )}
                  </Button>
                </div>
                {error && <p id={errorId} role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
