"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle, Clock, Instagram, Loader2, Mail, MapPin, Phone, Send } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Button } from "@/components/ui/button"
import { sendContactMessage } from "@/lib/api"
import { useStore } from "@/lib/store-context"

const SUBJECTS = ["Mahsulot haqida savol", "Buyurtma holati", "Yetkazib berish", "Kafolat va qaytarish", "Boshqa"]

const fieldClass =
  "mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "transition-shadow aria-[invalid=true]:border-red-500"

type Errors = Partial<Record<"name" | "contact" | "message", string>>

/** Links are rendered as href — http(s) only, whatever the API returned. */
function safeLink(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export default function ContactPage() {
  const { store } = useStore()
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "", website: "" })
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle")
  const [serverError, setServerError] = useState("")

  const change = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
    setServerError("")
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (status === "sending") return
    const next: Errors = {}
    if (form.name.trim().length < 2) next.name = "Ismingizni kiriting"
    if (!form.email.trim() && !form.phone.trim()) next.contact = "Javob berishimiz uchun email yoki telefon kiriting"
    else if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.contact = "Email manzil noto'g'ri"
    if (form.message.trim().length < 5) next.message = "Xabar matnini yozing (kamida 5 ta belgi)"
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setStatus("sending")
    // Stored on the server (POST /api/contact/) — the shop reads it in the admin panel.
    const res = await sendContactMessage({
      name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
      subject: form.subject, message: form.message.trim(), website: form.website,
    })
    if (!res.ok) {
      setStatus("idle")
      setServerError(res.error)
      return
    }
    setStatus("sent")
  }

  const contacts = [
    store.phone && { icon: Phone, title: "Telefon", lines: [store.phone, store.phone_secondary].filter(Boolean), href: `tel:${store.phone.replace(/[^\d+]/g, "")}`, action: "Qo'ng'iroq qilish" },
    store.email && { icon: Mail, title: "Email", lines: [store.email], href: `mailto:${store.email}`, action: "Xat yozish" },
    store.address && { icon: MapPin, title: "Manzil", lines: [store.address] },
    store.working_hours && { icon: Clock, title: "Ish vaqti", lines: [store.working_hours] },
  ].filter((item): item is Exclude<typeof item, "" | false> => Boolean(item))

  const socials = [
    safeLink(store.telegram_url) && { icon: Send, name: "Telegram", href: store.telegram_url },
    safeLink(store.instagram_url) && { icon: Instagram, name: "Instagram", href: store.instagram_url },
  ].filter((item): item is Exclude<typeof item, false> => Boolean(item))

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main-content" className="flex-1">
        <section className="bg-secondary/50 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h1 className="font-serif text-4xl text-balance sm:text-5xl lg:text-6xl">Biz bilan bog&apos;laning</h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Mahsulot, buyurtma yoki yetkazib berish bo&apos;yicha savolingiz bormi? Yozing — ish vaqtida javob beramiz.
            </p>
          </div>
        </section>

        {contacts.length > 0 && (
          <section className="py-12" aria-label="Aloqa ma'lumotlari">
            <ul className="mx-auto grid max-w-7xl gap-6 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
              {contacts.map((item) => (
                <li key={item.title} className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 font-semibold">{item.title}</h2>
                  {item.lines.map((line) => <p key={line} className="mt-1 break-words text-sm text-muted-foreground">{line}</p>)}
                  {"href" in item && item.href && (
                    <a href={item.href} className="mt-3 inline-block text-sm font-medium underline underline-offset-4 hover:no-underline">{item.action}</a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="py-12 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
            <div className="lg:col-span-2">
              <h2 className="font-serif text-2xl sm:text-3xl">Xabar yuborish</h2>
              <p className="mt-2 text-muted-foreground">Email yoki telefondan kamida bittasini qoldiring — shu orqali javob beramiz.</p>

              {status === "sent" ? (
                <div role="status" className="mt-8 rounded-2xl border border-green-300 bg-green-50 p-8 text-center dark:border-green-900 dark:bg-green-950">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-700 dark:text-green-400" aria-hidden="true" />
                  <h3 className="mt-4 text-xl font-semibold text-green-900 dark:text-green-100">Xabaringiz qabul qilindi</h3>
                  <p className="mt-2 text-green-800 dark:text-green-300">Ish vaqtida siz qoldirgan aloqa orqali javob beramiz.</p>
                  <Button asChild variant="outline" className="mt-6 rounded-xl"><Link href="/products">Xaridni davom ettirish</Link></Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
                  {/* Honeypot: hidden from people and assistive tech; bots fill it and are dropped by the server. */}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="website">Website</label>
                    <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={change} />
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium">Ismingiz <span aria-hidden="true">*</span></label>
                      <input id="name" name="name" type="text" autoComplete="name" required maxLength={120} value={form.name} onChange={change}
                        aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "name-error" : undefined} className={fieldClass} />
                      {errors.name && <p id="name-error" role="alert" className="mt-1.5 text-sm text-red-700">{errors.name}</p>}
                    </div>
                    <div>
                      <label htmlFor="subject" className="block text-sm font-medium">Mavzu</label>
                      <select id="subject" name="subject" value={form.subject} onChange={change} className={fieldClass}>
                        <option value="">Tanlang</option>
                        {SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium">Telefon</label>
                      <input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+998 90 123 45 67" maxLength={20} value={form.phone} onChange={change}
                        aria-invalid={errors.contact ? true : undefined} aria-describedby={errors.contact ? "contact-error" : undefined} className={fieldClass} />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium">Email</label>
                      <input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="ism@example.com" maxLength={255} value={form.email} onChange={change}
                        aria-invalid={errors.contact ? true : undefined} aria-describedby={errors.contact ? "contact-error" : undefined} className={fieldClass} />
                    </div>
                  </div>
                  {errors.contact && <p id="contact-error" role="alert" className="-mt-3 text-sm text-red-700">{errors.contact}</p>}

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium">Xabar <span aria-hidden="true">*</span></label>
                    <textarea id="message" name="message" required rows={6} maxLength={3000} value={form.message} onChange={change}
                      aria-invalid={errors.message ? true : undefined} aria-describedby={errors.message ? "message-error" : undefined} className={`${fieldClass} resize-none`} />
                    {errors.message && <p id="message-error" role="alert" className="mt-1.5 text-sm text-red-700">{errors.message}</p>}
                  </div>

                  {serverError && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{serverError}</p>}

                  <Button type="submit" size="lg" className="rounded-xl px-8" disabled={status === "sending"}>
                    {status === "sending"
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Yuborilmoqda</>
                      : <><Send className="mr-2 h-4 w-4" aria-hidden="true" />Yuborish</>}
                  </Button>
                </form>
              )}
            </div>

            <aside className="space-y-6">
              {socials.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-6">
                  <h2 className="font-serif text-xl">Ijtimoiy tarmoqlar</h2>
                  <ul className="mt-4 space-y-3">
                    {socials.map((social) => (
                      <li key={social.name}>
                        <a href={social.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-xl bg-secondary p-4 transition-colors hover:bg-secondary/70">
                          <social.icon className="h-5 w-5" aria-hidden="true" />
                          <span className="font-medium">{social.name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="font-serif text-xl">Tez-tez so&apos;raladigan savollar</h2>
                <p className="mt-2 text-sm text-muted-foreground">Yetkazib berish, to&apos;lov va kafolat haqidagi javoblar bir joyda.</p>
                <Button asChild variant="outline" className="mt-4 rounded-xl"><Link href="/faq">Savol-javoblarni ochish</Link></Button>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
