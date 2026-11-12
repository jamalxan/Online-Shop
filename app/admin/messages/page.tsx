"use client"

import { useCallback, useState } from "react"
import { Download, Mail, MailOpen, Trash2, UserMinus } from "lucide-react"
import {
  ConfirmDialog, EmptyState, ErrorBanner, FilterTabs, Modal, PageHeader, Pagination, Panel, SearchInput,
  SkeletonRows, buttonClass, useDebounced, useLoader,
} from "@/components/admin/ui"
import {
  adminDeleteMessage, adminDeleteSubscriber, adminExportSubscribers, adminGetMessages, adminGetSubscribers,
  adminSetMessageRead,
} from "@/lib/api"
import { cn, formatDate } from "@/lib/utils"
import type { AdminMessage, AdminSubscriber } from "@/lib/types"

type Tab = "messages" | "subscribers"
const TABS: readonly (readonly [Tab, string])[] = [["messages", "Murojaatlar"], ["subscribers", "Obunachilar"]]

type MessageState = "all" | "unread" | "read"
const MESSAGE_STATES: readonly (readonly [MessageState, string])[] = [["all", "Barchasi"], ["unread", "O'qilmagan"], ["read", "O'qilgan"]]

function Messages() {
  const [state, setState] = useState<MessageState>("all")
  const [page, setPage] = useState(1)
  const load = useCallback(() => adminGetMessages({ page, state: state === "all" ? "" : state }), [page, state])
  const { data, loading, error, reload } = useLoader(load)

  const [selected, setSelected] = useState<AdminMessage | null>(null)
  const [deleting, setDeleting] = useState<AdminMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState("")
  const messages = data?.results ?? []

  async function open(message: AdminMessage) {
    setSelected(message)
    if (!message.is_read) {
      const res = await adminSetMessageRead(message.id, true)
      if (res.ok) reload()
    }
  }

  async function markUnread(message: AdminMessage) {
    const res = await adminSetMessageRead(message.id, false)
    if (res.ok) { setSelected(null); reload() }
  }

  async function remove() {
    if (!deleting || busy) return
    setBusy(true)
    setActionError("")
    const res = await adminDeleteMessage(deleting.id)
    setBusy(false)
    if (!res.ok) { setActionError(res.error); return }
    setDeleting(null)
    setSelected(null)
    reload()
  }

  return (
    <>
      <ErrorBanner message={error} onRetry={reload} />
      <FilterTabs options={MESSAGE_STATES} value={state} onChange={(next) => { setState(next); setPage(1) }}
        counts={data ? { unread: data.unread } : undefined} label="Holat bo'yicha filtr" />

      <Panel className="overflow-hidden" aria-busy={loading}>
        <ul className={cn("divide-y divide-border", loading && data && "opacity-60 transition-opacity")}>
          {!data && loading && [0, 1, 2, 3].map((i) => (
            <li key={i} className="px-5 py-4" aria-hidden="true"><div className="h-10 animate-pulse rounded-xl bg-secondary" /></li>
          ))}
          {messages.map((message) => (
            <li key={message.id}>
              <button type="button" onClick={() => void open(message)} className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground">
                <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", message.is_read ? "bg-border" : "bg-foreground")} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className={cn("truncate text-sm", !message.is_read && "font-semibold")}>
                      {message.name}{!message.is_read && <span className="sr-only"> (o&apos;qilmagan)</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(message.created_at, true)}</span>
                  </span>
                  {message.subject && <span className="block truncate text-sm">{message.subject}</span>}
                  <span className="block truncate text-sm text-muted-foreground">{message.message}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {data && messages.length === 0 && (
          <EmptyState icon={Mail} title="Murojaat yo'q" hint="Saytdagi “Aloqa” formasi orqali yuborilgan xabarlar shu yerga tushadi." />
        )}
        {data && <Pagination page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun="ta murojaat" />}
      </Panel>

      {selected && (
        <Modal
          title={selected.subject || "Murojaat"}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button type="button" className={buttonClass.ghost} onClick={() => void markUnread(selected)}>
                <MailOpen className="h-4 w-4" aria-hidden="true" />
                O&apos;qilmagan deb belgilash
              </button>
              <button type="button" className={buttonClass.danger} onClick={() => { setActionError(""); setDeleting(selected) }}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                O&apos;chirish
              </button>
            </>
          }
        >
          <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-secondary p-3"><dt className="text-xs text-muted-foreground">Ism</dt><dd className="mt-0.5 font-medium">{selected.name}</dd></div>
            <div className="rounded-xl bg-secondary p-3"><dt className="text-xs text-muted-foreground">Yuborilgan</dt><dd className="mt-0.5 font-medium">{formatDate(selected.created_at, true)}</dd></div>
            {selected.email && (
              <div className="rounded-xl bg-secondary p-3">
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="mt-0.5 break-all font-medium"><a href={`mailto:${selected.email}`} className="rounded text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-foreground">{selected.email}</a></dd>
              </div>
            )}
            {selected.phone && (
              <div className="rounded-xl bg-secondary p-3">
                <dt className="text-xs text-muted-foreground">Telefon</dt>
                <dd className="mt-0.5 font-medium"><a href={`tel:${selected.phone}`} className="rounded text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-foreground">{selected.phone}</a></dd>
              </div>
            )}
          </dl>
          {/* plain text only: React escapes it, so a message can never inject markup */}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{selected.message}</p>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Murojaatni o'chirish"
          message={<>{deleting.name} yuborgan xabar butunlay o&apos;chiriladi.</>}
          confirmLabel="O'chirish" busy={busy} error={actionError}
          onConfirm={() => void remove()} onCancel={() => setDeleting(null)}
        />
      )}
    </>
  )
}

function Subscribers() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())
  const load = useCallback(() => adminGetSubscribers({ page, q }), [page, q])
  const { data, loading, error, reload } = useLoader(load)

  const [deleting, setDeleting] = useState<AdminSubscriber | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState("")
  const [exportState, setExportState] = useState<{ busy: boolean; csv: string; error: string }>({ busy: false, csv: "", error: "" })
  const subscribers = data?.results ?? []

  async function remove() {
    if (!deleting || busy) return
    setBusy(true)
    setActionError("")
    const res = await adminDeleteSubscriber(deleting.id)
    setBusy(false)
    if (!res.ok) { setActionError(res.error); return }
    setDeleting(null)
    reload()
  }

  async function exportCsv() {
    setExportState({ busy: true, csv: "", error: "" })
    const res = await adminExportSubscribers()
    if (!res.ok) { setExportState({ busy: false, csv: "", error: res.error }); return }
    // Offer the file through a real link the admin clicks (works without popups or programmatic downloads)
    setExportState({ busy: false, csv: res.data, error: "" })
  }

  return (
    <>
      <ErrorBanner message={error || exportState.error} onRetry={reload} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={(next) => { setSearch(next); setPage(1) }} label="Obunachilarni qidirish" placeholder="Email" />
        <button type="button" className={buttonClass.ghost} onClick={() => void exportCsv()} disabled={exportState.busy || !data || data.count === 0}>
          <Download className="h-4 w-4" aria-hidden="true" />
          CSV tayyorlash
        </button>
      </div>

      <Panel className="overflow-hidden" aria-busy={loading}>
        <div className="relative overflow-x-auto">
          <table className={cn("w-full text-sm", loading && data && "opacity-60 transition-opacity")}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Email</th>
                <th scope="col" className="px-4 py-3 font-medium">Obuna sanasi</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Amal</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && loading ? <SkeletonRows cols={3} rows={4} /> : subscribers.map((subscriber) => (
                <tr key={subscriber.id} className="transition-colors hover:bg-secondary/40">
                  <td className="break-all px-4 py-3 font-medium">{subscriber.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(subscriber.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => { setActionError(""); setDeleting(subscriber) }} aria-label={`${subscriber.email} — obunani o'chirish`} className={buttonClass.icon}>
                      <UserMinus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && subscribers.length === 0 && (
          <EmptyState icon={Mail} title="Obunachi yo'q" hint="Bosh sahifadagi obuna formasi orqali qoldirilgan manzillar shu yerda ko'rinadi." />
        )}
        {data && <Pagination page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun="ta obunachi" />}
      </Panel>

      {exportState.csv && (
        <Modal title="Obunachilar ro'yxati (CSV)" onClose={() => setExportState({ busy: false, csv: "", error: "" })}>
          <p className="mb-3 text-sm text-muted-foreground">
            Bu shaxsiy ma&apos;lumot. Eksport audit jurnaliga yozildi. Matnni nusxalab, <code>.csv</code> fayl sifatida saqlang.
          </p>
          <textarea readOnly value={exportState.csv} rows={10} aria-label="CSV matni" onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-xl border border-border bg-secondary p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-foreground/25" />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Obunani o'chirish"
          message={<>{deleting.email} ro&apos;yxatdan olib tashlanadi.</>}
          confirmLabel="O'chirish" busy={busy} error={actionError}
          onConfirm={() => void remove()} onCancel={() => setDeleting(null)}
        />
      )}
    </>
  )
}

export default function AdminMessagesPage() {
  const [tab, setTab] = useState<Tab>("messages")
  return (
    <div className="space-y-6">
      <PageHeader title="Murojaatlar" description="Saytdan kelgan xabarlar va yangiliklarga obuna bo'lganlar" />
      <FilterTabs options={TABS} value={tab} onChange={setTab} label="Bo'lim" />
      {tab === "messages" ? <Messages /> : <Subscribers />}
    </div>
  )
}
