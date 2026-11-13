"use client"

import { useCallback, useState } from "react"
import { Check, History, KeyRound, Mail, ShieldCheck } from "lucide-react"
import {
  EmptyState, ErrorBanner, Field, FilterTabs, PageHeader, Pagination, Panel, PanelHeader, SearchInput,
  SkeletonRows, Spinner, buttonClass, inputClass, useDebounced, useLoader,
} from "@/components/admin/ui"
import {
  adminConfirmEmailChange, adminGetAuditLog, adminGetSettings, adminRequestEmailChange, adminUpdateSettings,
  changePassword,
} from "@/lib/api"
import { useStore } from "@/lib/store-context"
import { cn, convertPrice, formatDate, formatPrice, pinActiveCurrency, toCurrency } from "@/lib/utils"
import type { AdminStoreSettings } from "@/lib/types"

type Tab = "store" | "account" | "audit"
const TABS: readonly (readonly [Tab, string])[] = [["store", "Do'kon"], ["account", "Hisob"], ["audit", "Faoliyat jurnali"]]

const alertClass = "rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
const successClass = "rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"

type FormState = Omit<AdminStoreSettings, "updated_at">
type FieldName = keyof FormState

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Admin panelga kirish",
  "product.create": "Mahsulot qo'shildi", "product.update": "Mahsulot o'zgartirildi", "product.delete": "Mahsulot o'chirildi",
  "product.photos_add": "Rasm qo'shildi", "product.photo_delete": "Rasm o'chirildi",
  "product.color_add": "Rang qo'shildi", "product.color_update": "Rang o'zgartirildi", "product.color_delete": "Rang o'chirildi",
  "product.color_photos_add": "Rang rasmi qo'shildi", "product.color_photo_delete": "Rang rasmi o'chirildi",
  "product.storage_add": "Xotira varianti qo'shildi", "product.storage_update": "Xotira varianti o'zgartirildi",
  "product.storage_delete": "Xotira varianti o'chirildi",
  "category.create": "Kategoriya qo'shildi", "category.update": "Kategoriya o'zgartirildi", "category.delete": "Kategoriya o'chirildi",
  "order.status": "Buyurtma holati", "payment.review": "To'lov ko'rib chiqildi",
  "customer.block": "Mijoz bloklandi", "customer.unblock": "Mijoz blokdan chiqarildi",
  "settings.update": "Sozlamalar o'zgartirildi", "message.delete": "Murojaat o'chirildi",
  "subscriber.delete": "Obunachi o'chirildi", "subscribers.export": "Obunachilar eksport qilindi",
  "account.password": "Admin paroli almashtirildi", "account.email": "Admin emaili almashtirildi",
}

function StoreForm({ initial, onSaved }: { initial: AdminStoreSettings; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [savedAt, setSavedAt] = useState(initial.updated_at)
  const [justSaved, setJustSaved] = useState(false)

  const set = (name: FieldName) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [name]: event.target.value }))
    setJustSaved(false)
  }

  const setRate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 7)
    setForm((prev) => ({ ...prev, usd_rate: Number(digits) }))
    setJustSaved(false)
  }

  // What the three currency settings add up to, shown before saving: a wrong rate is obvious here.
  const base = toCurrency(form.currency)
  const other = base === "USD" ? "UZS" : "USD"
  const sample = base === "USD" ? 1000 : 12_000_000
  const rateValid = form.usd_rate >= 1000 && form.usd_rate <= 1_000_000

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!rateValid) { setError("Dollar kursini to'g'ri kiriting: 1 dollar necha so'm (masalan, 12000)."); return }
    setSaving(true)
    setError("")
    const res = await adminUpdateSettings(form)
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    const { updated_at, ...saved } = res.data
    setForm(saved)
    setSavedAt(updated_at)
    setJustSaved(true)
    pinActiveCurrency(saved.currency) // prices in the admin panel switch format straight away
    onSaved()
  }

  const text = (name: FieldName, label: string, options: { hint?: string; type?: string; placeholder?: string; autoComplete?: string; inputMode?: "numeric" | "tel" | "email" | "url" } = {}) => (
    <Field label={label} hint={options.hint}>
      {(props) => (
        <input {...props} type={options.type ?? "text"} value={form[name]} onChange={set(name)}
          placeholder={options.placeholder} autoComplete={options.autoComplete ?? "off"} inputMode={options.inputMode} className={inputClass} />
      )}
    </Field>
  )

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Panel>
        <PanelHeader title="Aloqa ma'lumotlari" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {text("store_name", "Do'kon nomi")}
          {text("email", "Email", { type: "email", inputMode: "email", placeholder: "info@example.uz" })}
          {text("phone", "Telefon", { type: "tel", inputMode: "tel", placeholder: "+998 90 123 45 67" })}
          {text("phone_secondary", "Qo'shimcha telefon", { type: "tel", inputMode: "tel" })}
          <div className="sm:col-span-2">{text("address", "Manzil", { placeholder: "Toshkent sh., ..." })}</div>
          {text("working_hours", "Ish vaqti", { placeholder: "Du–Sha 9:00–20:00" })}
          {text("delivery_note", "Yetkazib berish haqida", { hint: "Checkout sahifasida ko'rsatiladi." })}
          {text("telegram_url", "Telegram havolasi", { type: "url", inputMode: "url", placeholder: "https://t.me/..." })}
          {text("instagram_url", "Instagram havolasi", { type: "url", inputMode: "url", placeholder: "https://instagram.com/..." })}
        </div>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Bo&apos;sh qoldirilgan maydon saytda ko&apos;rsatilmaydi (soxta raqam yoki manzil chiqmaydi).
        </p>
      </Panel>

      <Panel>
        <PanelHeader title="Valyuta va kurs" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field
            label="Narxlar valyutasi"
            hint={form.currency !== initial.currency
              ? `Diqqat: bu narxlarning o'zini o'zgartirmaydi — kiritilgan sonlar qaysi valyutada ekanini bildiradi. 999 deb kiritilgan narx endi ${formatPrice(999, base)} deb o'qiladi.`
              : "Mahsulot narxlarini qaysi valyutada kiritsangiz, shuni tanlang."}
          >
            {(props) => (
              <select {...props} value={form.currency} onChange={set("currency")} className={inputClass}>
                <option value="USD">AQSh dollari ($)</option>
                <option value="UZS">O&apos;zbek so&apos;mi (so&apos;m)</option>
              </select>
            )}
          </Field>
          <Field label="Dollar kursi (so'm)" hint="1 AQSh dollari necha so'm. Narxlar shu kurs bo'yicha hisoblanadi.">
            {(props) => (
              <input {...props} type="text" inputMode="numeric" value={form.usd_rate || ""} onChange={setRate}
                placeholder="12000" autoComplete="off" className={inputClass} />
            )}
          </Field>
          <Field label="Saytda standart ko'rinish" hint="Xaridor o'zi tanlamaguncha narxlar shu valyutada ko'rinadi.">
            {(props) => (
              <select {...props} value={form.display_currency} onChange={set("display_currency")} className={inputClass}>
                <option value="UZS">So&apos;mda — 13 500 000 so&apos;m</option>
                <option value="USD">Dollarda — $1,099</option>
              </select>
            )}
          </Field>
        </div>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          {rateValid
            ? <>Namuna: <span className="font-medium text-foreground">{formatPrice(sample, base)}</span> deb kiritilgan narx = <span className="font-medium text-foreground">{formatPrice(convertPrice(sample, base, other, form.usd_rate), other)}</span>. </>
            : "Kursni kiriting — namuna shu yerda ko'rinadi. "}
          Xaridor sayt tepasidagi «so&apos;m / $» tugmasi bilan valyutani o&apos;zi almashtira oladi.
        </p>
      </Panel>

      <Panel>
        <PanelHeader title="Kartaga o'tkazma orqali to'lov" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {text("payment_card_number", "Karta raqami", { inputMode: "numeric", placeholder: "8600 0000 0000 0000", hint: "Bo'sh bo'lsa, bu to'lov usuli saytda o'chiq turadi." })}
          {text("payment_card_holder", "Karta egasi", { placeholder: "ISM FAMILIYA" })}
        </div>
        <p className="flex items-start gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Mijozlar pulni shu kartaga o&apos;tkazadi. Kartani almashtirish audit jurnaliga yoziladi — kim va qachon o&apos;zgartirganini “Faoliyat jurnali”da ko&apos;rasiz.
        </p>
      </Panel>

      {error && <p role="alert" className={alertClass}>{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={buttonClass.primary} disabled={saving}>
          {saving ? <Spinner label="Saqlanmoqda" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          Saqlash
        </button>
        <p className="text-xs text-muted-foreground" role="status">
          {justSaved ? "Saqlandi. Saytda 1 daqiqa ichida yangilanadi." : `Oxirgi o'zgarish: ${formatDate(savedAt, true)}`}
        </p>
      </div>
    </form>
  )
}

function StoreSettingsTab() {
  const load = useCallback(() => adminGetSettings(), [])
  const { data, loading, error, reload } = useLoader(load)
  return (
    <>
      <ErrorBanner message={error} onRetry={reload} />
      {!data && loading && <div className="h-64 animate-pulse rounded-2xl bg-secondary" aria-hidden="true" />}
      {/* remount with fresh values only when the server copy changes */}
      {data && <StoreForm key={data.updated_at} initial={data} onSaved={() => undefined} />}
    </>
  )
}

// ─── Hisob: the signed-in admin's own login email and password ───

function EmailForm() {
  const { user, refreshUser } = useStore()
  const [step, setStep] = useState<"form" | "code">("form")
  const [newEmail, setNewEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [sentTo, setSentTo] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState("")

  async function requestCode(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    setDone("")
    const res = await adminRequestEmailChange(newEmail.trim(), password)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setPassword("") // not needed again: the code proves the rest
    setSentTo(res.data.email)
    setStep("code")
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    const res = await adminConfirmEmailChange(code.trim())
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setDone(`Email yangilandi: ${res.data.email}. Keyingi safar shu manzil bilan kirasiz.`)
    setStep("form")
    setNewEmail("")
    setCode("")
    void refreshUser() // the sidebar shows the address too
  }

  function startOver() {
    setStep("form")
    setCode("")
    setError("")
  }

  return (
    <Panel>
      <PanelHeader title="Kirish emaili" />
      <div className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">
          Hozirgi email: <span className="break-all font-medium text-foreground">{user?.email || "—"}</span>
        </p>
        {step === "form" ? (
          <form onSubmit={requestCode} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Yangi email" hint="Tasdiqlash kodi shu manzilga yuboriladi.">
                {(props) => (
                  <input {...props} type="email" inputMode="email" autoComplete="email" required value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)} className={inputClass} />
                )}
              </Field>
              <Field label="Joriy parol">
                {(props) => (
                  <input {...props} type="password" autoComplete="current-password" required value={password}
                    onChange={(event) => setPassword(event.target.value)} className={inputClass} />
                )}
              </Field>
            </div>
            {error && <p role="alert" className={alertClass}>{error}</p>}
            {done && <p role="status" className={successClass}>{done}</p>}
            <button type="submit" className={buttonClass.primary} disabled={busy || !newEmail.trim() || !password}>
              {busy ? <Spinner label="Yuborilmoqda" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
              Kod yuborish
            </button>
          </form>
        ) : (
          <form onSubmit={confirm} className="space-y-4" noValidate>
            <div className="max-w-xs">
              <Field label="Tasdiqlash kodi" hint={`${sentTo} manziliga 6 xonali kod yuborildi. Kod 5 daqiqa amal qiladi.`}>
                {(props) => (
                  <input {...props} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
                    value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className={inputClass} />
                )}
              </Field>
            </div>
            {error && <p role="alert" className={alertClass}>{error}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={buttonClass.primary} disabled={busy || code.length !== 6}>
                {busy ? <Spinner label="Tekshirilmoqda" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                Tasdiqlash
              </button>
              <button type="button" className={buttonClass.ghost} onClick={startOver} disabled={busy}>
                Boshqa email kiritish
              </button>
            </div>
          </form>
        )}
      </div>
      <p className="flex items-start gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Admin panelga kirish kodi shu emailga keladi. Yangi manzil kod bilan tasdiqlanmaguncha eski email o&apos;z kuchida qoladi.
      </p>
    </Panel>
  )
}

function PasswordForm() {
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || mismatch) return
    setBusy(true)
    setError("")
    setDone(false)
    const res = await changePassword(oldPassword, newPassword, confirmPassword)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setOldPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setDone(true)
  }

  return (
    <Panel>
      <PanelHeader title="Parol" />
      <form onSubmit={submit} className="space-y-4 p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Joriy parol">
            {(props) => (
              <input {...props} type="password" autoComplete="current-password" required value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)} className={inputClass} />
            )}
          </Field>
          <Field label="Yangi parol" hint="Kamida 8 belgi; faqat raqamlardan yoki juda oddiy bo'lmasin.">
            {(props) => (
              <input {...props} type="password" autoComplete="new-password" required minLength={8} value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)} className={inputClass} />
            )}
          </Field>
          <Field label="Yangi parolni takrorlang" error={mismatch ? "Parollar mos kelmadi" : undefined}>
            {(props) => (
              <input {...props} type="password" autoComplete="new-password" required minLength={8} value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} />
            )}
          </Field>
        </div>
        {error && <p role="alert" className={alertClass}>{error}</p>}
        {done && <p role="status" className={successClass}>Parol almashtirildi. Boshqa qurilmalardagi sessiyalar yopildi.</p>}
        <button type="submit" className={buttonClass.primary}
          disabled={busy || mismatch || !oldPassword || newPassword.length < 8 || !confirmPassword}>
          {busy ? <Spinner label="Saqlanmoqda" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
          Parolni almashtirish
        </button>
      </form>
    </Panel>
  )
}

function AccountTab() {
  return (
    <div className="space-y-6">
      <EmailForm />
      <PasswordForm />
    </div>
  )
}

function AuditTab() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())
  const load = useCallback(() => adminGetAuditLog({ page, q, page_size: 30 }), [page, q])
  const { data, loading, error, reload } = useLoader(load)
  const entries = data?.results ?? []

  return (
    <>
      <ErrorBanner message={error} onRetry={reload} />
      <SearchInput value={search} onChange={(next) => { setSearch(next); setPage(1) }} label="Jurnaldan qidirish" placeholder="Admin emaili yoki amal (masalan: settings)" />
      <Panel className="overflow-hidden" aria-busy={loading}>
        <div className="relative overflow-x-auto">
          <table className={cn("w-full text-sm", loading && data && "opacity-60 transition-opacity")}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Vaqt</th>
                <th scope="col" className="px-4 py-3 font-medium">Admin</th>
                <th scope="col" className="px-4 py-3 font-medium">Amal</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Tafsilot</th>
                <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && loading ? <SkeletonRows cols={5} /> : entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(entry.created_at, true)}</td>
                  <td className="break-all px-4 py-3">{entry.actor_email || "—"}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</p>
                    {entry.object_id && <p className="font-mono text-xs text-muted-foreground">{entry.object_type} #{entry.object_id}</p>}
                  </td>
                  <td className="hidden max-w-xs break-words px-4 py-3 text-muted-foreground md:table-cell">{entry.summary || "—"}</td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">{entry.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && entries.length === 0 && <EmptyState icon={History} title="Yozuv topilmadi" hint="Admin paneldagi har bir o'zgartirish shu yerda qayd etiladi." />}
        {data && <Pagination page={data.page} pages={data.pages} count={data.count} onPage={setPage} />}
      </Panel>
    </>
  )
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("store")
  return (
    <div className="space-y-6">
      <PageHeader title="Sozlamalar" description="Do'kon ma'lumotlari, to'lov rekvizitlari, admin hisobi va faoliyati" />
      <FilterTabs options={TABS} value={tab} onChange={setTab} label="Bo'lim" />
      {tab === "store" && <StoreSettingsTab />}
      {tab === "account" && <AccountTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  )
}
