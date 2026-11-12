"use client"

import { useCallback, useState } from "react"
import { Ban, Eye, RotateCcw, Users } from "lucide-react"
import {
  ConfirmDialog, EmptyState, ErrorBanner, FilterTabs, Modal, OrderStatusBadge, PageHeader, Pagination, Panel,
  SearchInput, SkeletonRows, Spinner, buttonClass, useDebounced, useLoader,
} from "@/components/admin/ui"
import { adminGetCustomer, adminGetCustomers, adminSetCustomerActive } from "@/lib/api"
import { cn, formatDate, formatPrice } from "@/lib/utils"
import type { AdminCustomer } from "@/lib/types"

type State = "all" | "active" | "blocked"
const STATES: readonly (readonly [State, string])[] = [["all", "Barchasi"], ["active", "Faol"], ["blocked", "Bloklangan"]]

function fullName(customer: AdminCustomer): string {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"
}

function CustomerDetail({ customerId, onClose, onChanged }: {
  customerId: number
  onClose: () => void
  onChanged: () => void
}) {
  const load = useCallback(() => adminGetCustomer(customerId), [customerId])
  const { data: customer, loading, error, reload } = useLoader(load)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState("")

  async function setActive(isActive: boolean) {
    if (busy) return
    setBusy(true)
    setActionError("")
    const res = await adminSetCustomerActive(customerId, isActive)
    setBusy(false)
    if (!res.ok) { setActionError(res.error); return }
    setConfirm(false)
    reload()
    onChanged()
  }

  return (
    <>
      <Modal title={customer ? fullName(customer) : "Mijoz"} onClose={onClose} size="lg" busy={busy}>
        <ErrorBanner message={error} onRetry={reload} />
        {!customer && loading && <div className="flex justify-center py-12"><Spinner /></div>}
        {customer && (
          <div className="space-y-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {[
                { label: "Email", value: customer.email || "—" },
                { label: "Telefon", value: customer.phone_number || "—" },
                { label: "Ro'yxatdan o'tgan", value: formatDate(customer.date_joined) },
                { label: "Oxirgi kirish", value: formatDate(customer.last_login, true) },
                { label: "Buyurtmalar", value: String(customer.orders_count) },
                { label: "Jami xarid", value: formatPrice(customer.total_spent) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-secondary p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
              <div>
                <p className="text-sm font-medium">{customer.is_active ? "Hisob faol" : "Hisob bloklangan"}</p>
                <p className="text-xs text-muted-foreground">
                  {customer.is_active
                    ? "Bloklansa, mijoz tizimga kira olmaydi va ochiq sessiyalari darhol yopiladi."
                    : "Blokdan chiqarilsa, mijoz yana kirishi mumkin."}
                </p>
              </div>
              {customer.is_active ? (
                <button type="button" className={buttonClass.danger} onClick={() => { setActionError(""); setConfirm(true) }} disabled={busy}>
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  Bloklash
                </button>
              ) : (
                <button type="button" className={buttonClass.primary} onClick={() => void setActive(true)} disabled={busy}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Blokdan chiqarish
                </button>
              )}
              {actionError && !confirm && <p role="alert" className="w-full text-sm text-red-700 dark:text-red-300">{actionError}</p>}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Oxirgi buyurtmalar</h3>
              {customer.orders.length === 0 ? (
                <p className="rounded-xl bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">Hali buyurtma bermagan</p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {customer.orders.map((order) => (
                    <li key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                      <span className="font-mono text-xs font-semibold">#{order.id}</span>
                      <span className="min-w-0 flex-1 truncate">{order.product?.title} × {order.quantity}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(order.created_at)}</span>
                      <span className="font-semibold tabular-nums">{formatPrice(order.total_price)}</span>
                      <OrderStatusBadge status={order.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {confirm && customer && (
        <ConfirmDialog
          title="Mijozni bloklash"
          message={<>{fullName(customer)} ({customer.email || customer.phone_number}) tizimga kira olmay qoladi. Mavjud buyurtmalari saqlanadi.</>}
          confirmLabel="Bloklash"
          busy={busy}
          error={actionError}
          onConfirm={() => void setActive(false)}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  )
}

export default function AdminCustomersPage() {
  const [state, setState] = useState<State>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)
  const q = useDebounced(search.trim())

  const load = useCallback(
    () => adminGetCustomers({ page, q, state: state === "all" ? "" : state }),
    [page, q, state],
  )
  const { data, loading, error, reload } = useLoader(load)
  const customers = data?.results ?? []

  return (
    <div className="space-y-6">
      <PageHeader title="Mijozlar" description={data ? `${data.count} ta mijoz` : "Yuklanmoqda…"} />
      <ErrorBanner message={error} onRetry={reload} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <FilterTabs options={STATES} value={state} onChange={(next) => { setState(next); setPage(1) }} label="Holat bo'yicha filtr" />
        <SearchInput value={search} onChange={(next) => { setSearch(next); setPage(1) }} label="Mijozlarni qidirish" placeholder="Ism, email yoki telefon" />
      </div>

      <Panel className="overflow-hidden" aria-busy={loading}>
        <div className="relative overflow-x-auto">
          <table className={cn("w-full text-sm", loading && data && "opacity-60 transition-opacity")}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Mijoz</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Telefon</th>
                <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Ro&apos;yxatdan o&apos;tgan</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Buyurtmalar</th>
                <th scope="col" className="hidden px-4 py-3 text-right font-medium sm:table-cell">Jami xarid</th>
                <th scope="col" className="px-4 py-3 font-medium">Holat</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Amal</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && loading ? <SkeletonRows cols={7} /> : customers.map((customer) => (
                <tr key={customer.id} className="transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{fullName(customer)}</p>
                    <p className="text-xs text-muted-foreground">{customer.email || "—"}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{customer.phone_number || "—"}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{formatDate(customer.date_joined)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{customer.orders_count}</td>
                  <td className="hidden px-4 py-3 text-right font-semibold tabular-nums sm:table-cell">{formatPrice(customer.total_spent)}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                      customer.is_active ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
                    )}>
                      {customer.is_active ? "Faol" : "Bloklangan"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setOpenId(customer.id)} aria-label={`${fullName(customer)} — batafsil`} className={buttonClass.icon}>
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && customers.length === 0 && (
          <EmptyState icon={Users} title="Mijoz topilmadi" hint={q || state !== "all" ? "Qidiruv yoki filtrni o'zgartirib ko'ring." : "Ro'yxatdan o'tgan mijozlar shu yerda ko'rinadi."} />
        )}
        {data && <Pagination page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun="ta mijoz" />}
      </Panel>

      {openId !== null && <CustomerDetail customerId={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  )
}
