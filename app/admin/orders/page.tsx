"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, ShoppingCart } from "lucide-react"
import {
  ConfirmDialog, EmptyState, ErrorBanner, FilterTabs, Modal, ORDER_STATUS, OrderStatusBadge, PageHeader,
  Pagination, Panel, PaymentBadge, SearchInput, SkeletonRows, Spinner, buttonClass, inputClass, isOrderStatus,
  useDebounced, useLoader,
} from "@/components/admin/ui"
import { adminGetOrders, adminUpdateOrderStatus } from "@/lib/api"
import { cn, formatDate, formatPrice } from "@/lib/utils"
import type { ApiOrder, OrderStatus } from "@/lib/types"

const DELIVERY_LABELS: Record<string, string> = {
  standard: "Standart yetkazib berish",
  express: "Tezkor yetkazib berish",
  pickup: "Do'kondan olib ketish",
}

type Filter = "all" | OrderStatus
const FILTERS: readonly (readonly [Filter, string])[] = [
  ["all", "Barchasi"], ["pending", "Yangi"], ["preparing", "Qadoqlanmoqda"],
  ["shipping", "Yo'lda"], ["delivered", "Yetkazildi"], ["canceled", "Bekor qilingan"],
]

// Mirrors the server's ALLOWED_TRANSITIONS — the server is the authority, this only shapes the menu.
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ["preparing", "shipping", "delivered"],
  preparing: ["pending", "shipping", "delivered"],
  shipping: ["preparing", "delivered"],
  delivered: [],
  canceled: [],
}

function initialFilter(): Filter {
  if (typeof window === "undefined") return "all"
  const value = new URLSearchParams(window.location.search).get("status") ?? ""
  return isOrderStatus(value) ? value : "all"
}

export default function AdminOrdersPage() {
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())

  // dashboard links: /admin/orders?status=pending
  useEffect(() => {
    const fromUrl = initialFilter()
    if (fromUrl !== "all") setFilter(fromUrl)
  }, [])

  const load = useCallback(
    () => adminGetOrders({ page, q, status: filter === "all" ? "" : filter }),
    [page, q, filter],
  )
  const { data, loading, error, reload } = useLoader(load)

  const [selected, setSelected] = useState<ApiOrder | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState("")
  const [confirmCancel, setConfirmCancel] = useState(false)

  const orders = data?.results ?? []
  const counts = data ? { ...data.status_counts, all: Object.values(data.status_counts).reduce((a, b) => a + b, 0) } : undefined

  const changeFilter = (next: Filter) => { setFilter(next); setPage(1) }
  const changeSearch = (next: string) => { setSearch(next); setPage(1) }

  function open(order: ApiOrder) {
    setUpdateError("")
    setSelected(order)
  }

  async function changeStatus(status: OrderStatus) {
    if (!selected || updating || selected.status === status) return
    setUpdating(true)
    setUpdateError("")
    const res = await adminUpdateOrderStatus(selected.id, status)
    setUpdating(false)
    if (!res.ok) { setUpdateError(res.error); return }
    setConfirmCancel(false)
    setSelected(res.data ?? { ...selected, status })
    reload()
  }

  const selectedStatus = selected && isOrderStatus(selected.status) ? selected.status : null
  const nextStatuses = selectedStatus ? NEXT_STATUSES[selectedStatus] : []
  const canCancel = selectedStatus !== null && selectedStatus !== "delivered" && selectedStatus !== "canceled"

  return (
    <div className="space-y-6">
      <PageHeader title="Buyurtmalar" description={data ? `Jami ${counts?.all ?? 0} ta buyurtma` : "Yuklanmoqda…"} />
      <ErrorBanner message={error} onRetry={reload} />

      <FilterTabs options={FILTERS} value={filter} onChange={changeFilter} counts={counts} label="Holat bo'yicha filtr" />
      <SearchInput value={search} onChange={changeSearch} label="Buyurtmalarni qidirish" placeholder="#raqam, ism, telefon, email yoki mahsulot" />

      <Panel className="overflow-hidden" aria-busy={loading}>
        <div className="relative overflow-x-auto">
          <table className={cn("w-full text-sm", loading && data && "opacity-60 transition-opacity")}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Buyurtma</th>
                <th scope="col" className="px-4 py-3 font-medium">Mijoz</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Mahsulot</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Summa</th>
                <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">To&apos;lov</th>
                <th scope="col" className="px-4 py-3 font-medium">Holat</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Amal</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data && loading ? <SkeletonRows cols={7} /> : orders.map((order) => (
                <tr key={order.id} className="transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-semibold">#{order.id}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.created_at, true)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{order.first_name || order.user_email || "—"}</p>
                    <p className="text-xs text-muted-foreground">{order.phone_number || ""}</p>
                  </td>
                  <td className="hidden max-w-[220px] truncate px-4 py-3 text-muted-foreground md:table-cell">
                    {order.product?.title} × {order.quantity}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(order.total_price)}</td>
                  <td className="hidden px-4 py-3 lg:table-cell"><PaymentBadge status={order.payment_status} demo={order.payment_demo} /></td>
                  <td className="px-4 py-3"><OrderStatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => open(order)} aria-label={`#${order.id} buyurtmani ochish`} className={buttonClass.icon}>
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && orders.length === 0 && (
          <EmptyState icon={ShoppingCart} title="Buyurtma topilmadi"
            hint={q || filter !== "all" ? "Qidiruv yoki filtrni o'zgartirib ko'ring." : "Birinchi buyurtma kelganda shu yerda ko'rinadi."} />
        )}
        {data && <Pagination page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun="ta buyurtma" />}
      </Panel>

      {selected && (
        <Modal title={`Buyurtma #${selected.id}`} onClose={() => setSelected(null)} busy={updating}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Mijoz", value: selected.first_name || "—" },
              { label: "Telefon", value: selected.phone_number || "—" },
              { label: "Email", value: selected.user_email || "—", wide: true },
              { label: "Mahsulot", value: [selected.product?.title, selected.storage_label, selected.color_name].filter(Boolean).join(" · "), wide: true },
              { label: "Miqdor", value: `${selected.quantity} ta × ${formatPrice(selected.unit_price)}` },
              { label: "Jami", value: formatPrice(selected.total_price) },
              { label: "Yetkazib berish", value: DELIVERY_LABELS[selected.delivery_method ?? ""] ?? "—", wide: true },
              ...(selected.address ? [{ label: "Manzil", value: selected.address, wide: true }] : []),
              ...(selected.comment ? [{ label: "Mijoz izohi", value: selected.comment, wide: true }] : []),
              { label: "Yaratilgan", value: formatDate(selected.created_at, true) },
              { label: "Yangilangan", value: formatDate(selected.updated_at, true) },
            ].map(({ label, value, wide }) => (
              <div key={label} className={cn("rounded-xl bg-secondary p-3", wide && "col-span-2")}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 whitespace-pre-line break-words font-medium">{value}</dd>
              </div>
            ))}
            <div className="col-span-2 flex items-center justify-between rounded-xl bg-secondary p-3">
              <dt className="text-xs text-muted-foreground">To&apos;lov</dt>
              <dd className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-sm font-medium">{selected.payment_method_display || "Qabul qilganda to'lash"}</span>
                {selected.payment_status && <PaymentBadge status={selected.payment_status} demo={selected.payment_demo} />}
              </dd>
            </div>
          </dl>

          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Holat</span>
              <OrderStatusBadge status={selected.status} />
            </div>
            {nextStatuses.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <label htmlFor="order-status" className="sr-only">Yangi holat</label>
                <select
                  id="order-status"
                  value=""
                  disabled={updating}
                  onChange={(event) => { if (isOrderStatus(event.target.value)) void changeStatus(event.target.value) }}
                  className={inputClass}
                >
                  <option value="" disabled>Holatni o&apos;zgartirish…</option>
                  {nextStatuses.map((status) => (
                    <option key={status} value={status}>{ORDER_STATUS[status].label}</option>
                  ))}
                </select>
                {updating && <Spinner label="Saqlanmoqda" />}
              </div>
            )}
            {selectedStatus === "delivered" && <p className="mt-2 text-xs text-muted-foreground">Yetkazilgan buyurtma holati o&apos;zgartirilmaydi.</p>}
            {canCancel && (
              <button type="button" className="mt-3 rounded text-sm font-medium text-red-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-red-600 dark:text-red-300" onClick={() => { setUpdateError(""); setConfirmCancel(true) }} disabled={updating}>
                Buyurtmani bekor qilish
              </button>
            )}
            {updateError && !confirmCancel && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{updateError}</p>}
          </div>
        </Modal>
      )}

      {selected && confirmCancel && (
        <ConfirmDialog
          title={`#${selected.id} buyurtmani bekor qilish`}
          message={<>Mahsulot ({selected.quantity} dona) omborga qaytariladi va mijozga xabar yuboriladi. Bekor qilingan buyurtmani qayta tiklab bo&apos;lmaydi.</>}
          confirmLabel="Bekor qilish"
          busy={updating}
          error={updateError}
          onConfirm={() => void changeStatus("canceled")}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  )
}
