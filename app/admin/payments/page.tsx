"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Check, CreditCard, Eye, ImageOff, X } from "lucide-react"
import {
  EmptyState, ErrorBanner, Field, FilterTabs, Modal, PageHeader, Pagination, Panel, PaymentBadge,
  SkeletonRows, Spinner, buttonClass, inputClass, useLoader,
} from "@/components/admin/ui"
import { adminGetPayments, adminReviewPayment, fetchPrivateImage } from "@/lib/api"
import { cn, formatDate, formatPrice } from "@/lib/utils"
import type { AdminPayment } from "@/lib/types"

type Filter = "review" | "complete" | "canceled" | "all"
const FILTERS: readonly (readonly [Filter, string])[] = [
  ["review", "Tekshirilmoqda"], ["complete", "Tasdiqlangan"], ["canceled", "Rad etilgan"], ["all", "Barchasi"],
]

/** Receipts are private: fetched with the admin token and shown from an object URL. */
function Receipt({ url }: { url: string | null }) {
  const [state, setState] = useState<{ src: string | null; done: boolean }>({ src: null, done: false })

  useEffect(() => {
    if (!url) return
    let alive = true
    let objectUrl: string | null = null
    void fetchPrivateImage(url).then((src) => {
      if (!alive) { if (src) URL.revokeObjectURL(src); return }
      objectUrl = src
      setState({ src, done: true })
    })
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url])

  if (!url || (state.done && !state.src)) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl bg-secondary text-sm text-muted-foreground">
        <ImageOff className="h-6 w-6" aria-hidden="true" />
        Chek rasmi mavjud emas
      </div>
    )
  }
  if (!state.src) return <div className="flex h-48 items-center justify-center rounded-xl bg-secondary"><Spinner label="Chek yuklanmoqda" /></div>
  return (
    <a href={state.src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL of a private file; the image optimizer cannot fetch it */}
      <img src={state.src} alt="To'lov cheki" className="max-h-[420px] w-full bg-secondary object-contain" />
    </a>
  )
}

export default function AdminPaymentsPage() {
  const [filter, setFilter] = useState<Filter>("review")
  const [page, setPage] = useState(1)
  const load = useCallback(() => adminGetPayments({ page, status: filter === "all" ? "" : filter }), [page, filter])
  const { data, loading, error, reload } = useLoader(load)

  const [selected, setSelected] = useState<AdminPayment | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState("")

  const payments = data?.results ?? []
  const counts = data ? { ...data.status_counts, all: Object.values(data.status_counts).reduce((a, b) => a + b, 0) } : undefined

  function open(payment: AdminPayment) {
    setNote(payment.note ?? "")
    setActionError("")
    setSelected(payment)
  }

  async function review(status: "complete" | "canceled") {
    if (!selected || busy) return
    if (status === "canceled" && !note.trim()) { setActionError("Rad etish sababini yozing — mijoz buni ko'radi"); return }
    setBusy(true)
    setActionError("")
    const res = await adminReviewPayment(selected.id, status, note.trim())
    setBusy(false)
    if (!res.ok) { setActionError(res.error); return }
    setSelected(null)
    reload()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="To'lovlar"
        description={<>Kartaga o&apos;tkazma cheklari. Rekvizitlar <Link href="/admin/settings" className="rounded font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-foreground">Sozlamalar</Link>da kiritiladi.</>}
      />
      <ErrorBanner message={error} onRetry={reload} />
      <FilterTabs options={FILTERS} value={filter} onChange={(next) => { setFilter(next); setPage(1) }} counts={counts} label="Holat bo'yicha filtr" />

      <Panel className="overflow-hidden" aria-busy={loading}>
        <div className="relative overflow-x-auto">
          <table className={cn("w-full text-sm", loading && data && "opacity-60 transition-opacity")}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">To&apos;lov</th>
                <th scope="col" className="px-4 py-3 font-medium">Mijoz</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Buyurtmalar</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Summa</th>
                <th scope="col" className="px-4 py-3 font-medium">Holat</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Amal</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && loading ? <SkeletonRows cols={6} /> : payments.map((payment) => (
                <tr key={payment.id} className="transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-semibold">#{payment.id}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(payment.created_at, true)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{payment.user_name || payment.user_email || "—"}</p>
                    {payment.user_name && <p className="text-xs text-muted-foreground">{payment.user_email}</p>}
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground md:table-cell">
                    {payment.orders.map((order) => `#${order.id}`).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(payment.amount)}</td>
                  <td className="px-4 py-3"><PaymentBadge status={payment.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => open(payment)} aria-label={`#${payment.id} to'lovni ko'rish`} className={buttonClass.icon}>
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && payments.length === 0 && (
          <EmptyState icon={CreditCard} title={filter === "review" ? "Tekshiriladigan to'lov yo'q" : "To'lov topilmadi"}
            hint="Mijoz kartaga o'tkazma qilib chek yuklasa, shu yerda paydo bo'ladi." />
        )}
        {data && <Pagination page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun="ta to'lov" />}
      </Panel>

      {selected && (
        <Modal
          title={`To'lov #${selected.id}`}
          onClose={() => setSelected(null)}
          size="lg"
          busy={busy}
          footer={selected.status === "review" ? (
            <>
              <button type="button" className={buttonClass.ghost} onClick={() => void review("canceled")} disabled={busy}>
                <X className="h-4 w-4" aria-hidden="true" />
                Rad etish
              </button>
              <button type="button" className={buttonClass.accent} onClick={() => void review("complete")} disabled={busy}>
                {busy ? <Spinner label="Saqlanmoqda" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                Tasdiqlash
              </button>
            </>
          ) : undefined}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Receipt url={selected.receipt_url} />
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <div className="col-span-2 rounded-xl bg-foreground p-4 text-background">
                  <dt className="text-xs text-background/70">To&apos;lanishi kerak bo&apos;lgan summa</dt>
                  <dd className="mt-1 font-serif text-3xl tabular-nums text-background">{formatPrice(selected.amount)}</dd>
                </div>
                <div className="rounded-xl bg-secondary p-3">
                  <dt className="text-xs text-muted-foreground">Mijoz</dt>
                  <dd className="mt-0.5 break-words font-medium">{selected.user_name || selected.user_email || "—"}</dd>
                </div>
                <div className="rounded-xl bg-secondary p-3">
                  <dt className="text-xs text-muted-foreground">Holat</dt>
                  <dd className="mt-1"><PaymentBadge status={selected.status} /></dd>
                </div>
              </dl>

              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Buyurtmalar</h3>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {selected.orders.map((order) => (
                    <li key={order.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="font-mono text-xs font-semibold">#{order.id}</span>
                      <span className="min-w-0 flex-1 truncate">{order.title} × {order.quantity}</span>
                      <span className="font-semibold tabular-nums">{formatPrice(order.total_price)}</span>
                    </li>
                  ))}
                  {selected.orders.length === 0 && <li className="px-3 py-3 text-muted-foreground">Buyurtma topilmadi</li>}
                </ul>
              </div>

              {selected.status === "review" ? (
                <Field label="Izoh" hint="Rad etilsa majburiy — mijoz sababini ko'radi.">
                  {(props) => (
                    <textarea {...props} value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={3} className={cn(inputClass, "resize-none")} placeholder="Masalan: summa to'liq tushmagan" />
                  )}
                </Field>
              ) : (
                <div className="rounded-xl bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">
                    Ko&apos;rib chiqdi: {selected.reviewed_by_email || "—"} · {formatDate(selected.reviewed_at, true)}
                  </p>
                  {selected.note && <p className="mt-1">{selected.note}</p>}
                </div>
              )}
              {actionError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{actionError}</p>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
