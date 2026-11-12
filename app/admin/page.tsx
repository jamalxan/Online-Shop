"use client"

import { useCallback, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowDownRight, ArrowUpRight, CreditCard, Mail, Minus, PackageX, Plus, ShoppingCart,
} from "lucide-react"
import { RevenueChart } from "@/components/admin/revenue-chart"
import {
  ErrorBanner, FilterTabs, ORDER_STATUS, ORDER_STATUSES, OrderStatusBadge, PageHeader, Panel, PanelHeader,
  buttonClass, useLoader,
} from "@/components/admin/ui"
import { adminGetStats, getImageUrl } from "@/lib/api"
import { cn, formatDate, formatPrice, priceParts, toNumber } from "@/lib/utils"

const PERIODS = [["7", "7 kun"], ["30", "30 kun"], ["90", "90 kun"]] as const
type Period = (typeof PERIODS)[number][0]

/** Percentage change vs the previous period; null when there is nothing to compare with. */
function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}

/** Three facts the chart alone does not state outright. */
function seriesSummary(series: { date: string; revenue: string; orders: number }[]) {
  const values = series.map((point) => toNumber(point.revenue))
  const total = values.reduce((sum, value) => sum + value, 0)
  const best = values.reduce((top, value, index) => (value > values[top] ? index : top), 0)
  const [, month, day] = (series[best]?.date ?? "--").split("-")
  return [
    { label: "Kunlik o'rtacha", value: formatPrice(series.length ? Math.round(total / series.length) : 0) },
    { label: total > 0 ? `Eng yaxshi kun (${day}.${month})` : "Eng yaxshi kun", value: total > 0 ? formatPrice(values[best]) : "—" },
    { label: "Sotuvsiz kunlar", value: String(values.filter((value) => value === 0).length) },
  ]
}

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">yangi</span>
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
      value > 0 && "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
      value < 0 && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
      value === 0 && "bg-secondary text-muted-foreground",
    )}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {Math.abs(value)}%
      <span className="sr-only">{value > 0 ? " o'sish" : value < 0 ? " pasayish" : " o'zgarishsiz"}</span>
    </span>
  )
}

function Kpi({ label, value, unit, trend, hint, featured }: {
  label: string
  value: string
  /** currency unit that follows the figure ("so'm"); empty for counts and for "$1,099" */
  unit?: string
  trend: number | null
  hint: string
  featured?: boolean
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-5",
      featured ? "border-transparent bg-foreground text-background" : "border-border bg-card",
    )}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-sm", featured ? "text-background/70" : "text-muted-foreground")}>{label}</p>
        <Trend value={trend} />
      </div>
      <p className={cn(
        "mt-3 font-serif leading-none tracking-tight tabular-nums",
        // four cards share a row on wide screens: a figure in the billions steps down instead of spilling out
        value.length > 12 ? "text-3xl" : "text-4xl",
        featured && "text-background",
      )}>
        {value}
        {unit && <span className={cn("ml-1.5 font-sans text-sm font-medium tracking-normal", featured ? "text-background/70" : "text-muted-foreground")}>{unit}</span>}
      </p>
      <p className={cn("mt-2 text-xs", featured ? "text-background/70" : "text-muted-foreground")}>{hint}</p>
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5" aria-hidden="true">
      <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
      <div className="mt-4 h-9 w-32 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-3 w-28 animate-pulse rounded bg-secondary" />
    </div>
  )
}

export default function AdminDashboard() {
  const [period, setPeriod] = useState<Period>("30")
  const load = useCallback(() => adminGetStats(Number(period)), [period])
  const { data: stats, loading, error, reload } = useLoader(load)

  const now = stats?.period
  const before = stats?.previous
  const queue = stats ? [
    { href: "/admin/orders?status=pending", label: "Yangi buyurtmalar", count: stats.counters.pending_orders, icon: ShoppingCart },
    { href: "/admin/payments", label: "Tekshiriladigan to'lovlar", count: stats.counters.payments_review, icon: CreditCard },
    { href: "/admin/messages", label: "O'qilmagan murojaatlar", count: stats.counters.unread_messages, icon: Mail },
  ] : []
  const statusTotal = stats ? ORDER_STATUSES.reduce((sum, key) => sum + (stats.status_counts[key] ?? 0), 0) : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Oxirgi ${period} kun, oldingi ${period} kun bilan taqqoslangan`}
        actions={
          <>
            <FilterTabs options={PERIODS} value={period} onChange={setPeriod} label="Davr" />
            <Link href="/admin/products?new=1" className={buttonClass.accent}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Mahsulot
            </Link>
          </>
        }
      />

      <ErrorBanner message={error} onRetry={reload} />

      <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", loading && stats && "opacity-60 transition-opacity")} aria-busy={loading}>
        {!now || !before ? (
          <><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /></>
        ) : (
          <>
            <Kpi featured label="Tushum" value={priceParts(now.revenue).amount} unit={priceParts(now.revenue).unit}
              trend={delta(toNumber(now.revenue), toNumber(before.revenue))}
              hint={`Oldingi davr: ${formatPrice(before.revenue)}`} />
            <Kpi label="Buyurtmalar" value={String(now.orders)}
              trend={delta(now.orders, before.orders)} hint={`${now.checkouts} ta xarid (checkout)`} />
            <Kpi label="O'rtacha chek" value={priceParts(now.avg_check).amount} unit={priceParts(now.avg_check).unit}
              trend={delta(toNumber(now.avg_check), toNumber(before.avg_check))}
              hint={`Oldingi davr: ${formatPrice(before.avg_check)}`} />
            <Kpi label="Yangi mijozlar" value={String(now.new_customers)}
              trend={delta(now.new_customers, before.new_customers)} hint={`Jami mijozlar: ${stats.total_users}`} />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Kunlik tushum" action={<span className="text-xs text-muted-foreground">Bekor qilinganlar hisobga olinmaydi</span>} />
          <div className="p-4 sm:p-5">
            {stats ? <RevenueChart series={stats.series} /> : <div className="h-60 animate-pulse rounded-xl bg-secondary xl:h-72" aria-hidden="true" />}
          </div>
          {stats && (
            <dl className="grid grid-cols-1 divide-y divide-border border-t border-border text-center sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {seriesSummary(stats.series).map(({ label, value }) => (
                <div key={label} className="px-3 py-4">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-serif text-xl tabular-nums sm:text-2xl">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Navbatdagi ishlar" />
          <ul className="divide-y divide-border">
            {(stats ? queue : []).map(({ href, label, count, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", count > 0 ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-sm">{label}</span>
                  <span className="font-serif text-2xl tabular-nums">{count}</span>
                </Link>
              </li>
            ))}
            {!stats && [0, 1, 2].map((i) => (
              <li key={i} className="px-5 py-4" aria-hidden="true"><div className="h-10 animate-pulse rounded-xl bg-secondary" /></li>
            ))}
          </ul>
          {stats && (
            <div className="border-t border-border p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Barcha buyurtmalar holati</p>
              <ul className="space-y-2.5">
                {ORDER_STATUSES.map((key) => {
                  const count = stats.status_counts[key] ?? 0
                  const share = statusTotal ? Math.round((count / statusTotal) * 100) : 0
                  return (
                    <li key={key} className="text-xs">
                      <div className="mb-1 flex justify-between">
                        <span>{ORDER_STATUS[key].label}</span>
                        <span className="tabular-nums text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                        <div className={cn("h-full rounded-full", key === "canceled" ? "bg-red-500" : "bg-foreground")} style={{ width: `${share}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Oxirgi buyurtmalar" action={<Link href="/admin/orders" className="rounded text-xs font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-foreground">Barchasi</Link>} />
          {stats && stats.recent_orders.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">Hali buyurtma yo&apos;q</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr><th scope="col">Buyurtma</th><th scope="col">Mijoz</th><th scope="col">Summa</th><th scope="col">Holat</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(stats?.recent_orders ?? []).map((order) => (
                    <tr key={order.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium">{order.product?.title} <span className="text-muted-foreground">× {order.quantity}</span></p>
                        <p className="font-mono text-xs text-muted-foreground">#{order.id} · {formatDate(order.created_at, true)}</p>
                      </td>
                      <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">{order.first_name || order.user_email || "—"}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatPrice(order.total_price)}</td>
                      <td className="px-5 py-3"><OrderStatusBadge status={order.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Eng ko'p sotilgan" />
            {stats && stats.top_products.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Bu davrda sotuv yo&apos;q</p>
            ) : (
              <ol className="divide-y divide-border">
                {(stats?.top_products ?? []).map((product, index) => (
                  <li key={product.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="font-serif text-xl tabular-nums text-muted-foreground" aria-hidden="true">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{product.title}</span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{formatPrice(product.revenue)}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{product.quantity} dona</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Kam qolgan mahsulotlar" action={stats && <span className="text-xs text-muted-foreground">≤ {stats.low_stock_threshold} dona</span>} />
            {stats && stats.low_stock.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Barcha mahsulotlar yetarli</p>
            ) : (
              <ul className="divide-y divide-border">
                {(stats?.low_stock ?? []).map((product) => (
                  <li key={product.id}>
                    <Link href={`/admin/products?edit=${product.id}`} className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground">
                      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-secondary">
                        {product.thumbnail_photo
                          ? <Image src={getImageUrl(product.thumbnail_photo)} alt="" fill sizes="36px" className="object-cover" />
                          : <PackageX className="m-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{product.title}</span>
                      <span className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                        product.quantity === 0 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
                      )}>
                        {product.quantity === 0 ? "Tugagan" : `${product.quantity} dona`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
