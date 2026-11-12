"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, Package,
  Search, Truck, X, XCircle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApiResult } from "@/lib/api"
import type { OrderStatus, PaymentStatus } from "@/lib/types"

// ─── Data loading ─────────────────────────────────────────

/**
 * Runs `load` whenever its identity changes (wrap it in useCallback) or `reload()` is called.
 * Stale responses are dropped; previous data stays on screen while a new page is loading.
 */
export function useLoader<T>(load: () => Promise<ApiResult<T>>) {
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState<{
    data: T | null
    error: string
    settledFor: unknown
    tick: number
  }>({ data: null, error: "", settledFor: null, tick: -1 })

  useEffect(() => {
    let alive = true
    void load().then((res) => {
      if (!alive) return
      setResult((prev) =>
        res.ok
          ? { data: res.data, error: "", settledFor: load, tick }
          : { data: prev.data, error: res.error, settledFor: load, tick },
      )
    })
    return () => { alive = false }
  }, [load, tick])

  const loading = result.settledFor !== load || result.tick !== tick
  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { data: result.data, error: loading ? "" : result.error, loading, reload }
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ─── Layout primitives ────────────────────────────────────

export function PageHeader({ title, description, actions }: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ className, children, ...rest }: React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card shadow-[0_1px_0_rgb(0_0_0/0.03)]", className)} {...rest}>
      {children}
    </section>
  )
}

export function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {message}
      </span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 rounded-lg px-2 py-1 font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
          Qayta urinish
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon = Package, title, hint }: { icon?: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SkeletonRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: cols }, (_, col) => (
            <td key={col} className="px-4 py-4">
              <div className={cn("h-4 animate-pulse rounded bg-secondary", col === 0 ? "w-32" : "w-20")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ─── Controls ─────────────────────────────────────────────

export const inputClass =
  "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 " +
  "transition-shadow placeholder:text-muted-foreground/70 disabled:opacity-60"

export const buttonClass = {
  primary:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background " +
    "transition-colors hover:bg-foreground/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
  accent:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background " +
    "transition-colors hover:bg-foreground/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
  ghost:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium " +
    "transition-colors hover:bg-secondary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
  danger:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-medium text-white " +
    "transition-colors hover:bg-red-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600",
  icon:
    "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary " +
    "hover:text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground",
} as const

export function Field({ label, hint, error, children }: {
  label: string
  hint?: string
  error?: string
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode
}) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error || hint
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children({ id, "aria-describedby": note ? noteId : undefined, "aria-invalid": error ? true : undefined })}
      {note && (
        <p id={noteId} className={cn("mt-1.5 text-xs", error ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>
          {note}
        </p>
      )}
    </div>
  )
}

export function SearchInput({ value, onChange, label, placeholder }: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? label}
        aria-label={label}
        className={cn(inputClass, "bg-card pl-10")}
      />
    </div>
  )
}

export function FilterTabs<T extends string>({ options, value, onChange, counts, label }: {
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (value: T) => void
  counts?: Partial<Record<T, number>>
  label: string
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={label}>
      {options.map(([key, text]) => {
        const active = value === key
        const count = counts?.[key]
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            // the row scrolls sideways on phones: a focused tab must never stay half-hidden
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
              active ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {text}
            {count !== undefined && (
              <span className={cn("rounded-md px-1.5 py-0.5 text-xs tabular-nums", active ? "bg-background/20 text-background" : "bg-secondary")}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Pagination({ page, pages, count, onPage, noun = "ta yozuv" }: {
  page: number
  pages: number
  count: number
  onPage: (page: number) => void
  noun?: string
}) {
  if (count === 0) return null
  return (
    <nav className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 text-sm" aria-label="Sahifalar">
      <p className="text-muted-foreground tabular-nums">Jami {count} {noun}</p>
      <div className="flex items-center gap-1">
        <button type="button" className={buttonClass.icon} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Oldingi sahifa">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="px-2 tabular-nums" aria-current="page">{page} / {pages}</span>
        <button type="button" className={buttonClass.icon} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Keyingi sahifa">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}

export function Toggle({ checked, onChange, label, disabled }: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
        checked ? "bg-foreground" : "bg-border",
      )}
    >
      <span className={cn(
        "absolute top-0.5 h-5 w-5 rounded-full shadow-sm transition-transform",
        checked ? "translate-x-5 bg-background" : "translate-x-0.5 bg-white",
      )} />
    </button>
  )
}

// ─── Status badges ────────────────────────────────────────

export const ORDER_STATUS: Record<OrderStatus, { label: string; icon: LucideIcon; className: string }> = {
  pending:   { label: "Yangi",        icon: Clock,        className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200" },
  preparing: { label: "Qadoqlanmoqda", icon: Package,      className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  shipping:  { label: "Yo'lda",       icon: Truck,        className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200" },
  delivered: { label: "Yetkazildi",   icon: CheckCircle2, className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  canceled:  { label: "Bekor qilindi", icon: XCircle,      className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200" },
}

export const ORDER_STATUSES = Object.keys(ORDER_STATUS) as OrderStatus[]

export function isOrderStatus(value: string): value is OrderStatus {
  return value in ORDER_STATUS
}

export function OrderStatusBadge({ status }: { status: string }) {
  const config = isOrderStatus(status) ? ORDER_STATUS[status] : null
  const Icon = config?.icon ?? Clock
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", config?.className ?? "bg-secondary")}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {config?.label ?? status}
    </span>
  )
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; className: string }> = {
  review:   { label: "Tekshirilmoqda", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200" },
  complete: { label: "To'langan",      className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  canceled: { label: "Rad etilgan",    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200" },
}

export function PaymentBadge({ status }: { status: PaymentStatus | null | undefined }) {
  if (!status) return <span className="text-xs text-muted-foreground">Qabul qilganda</span>
  const config = PAYMENT_STATUS[status]
  return (
    <span className={cn("inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium", config?.className ?? "bg-secondary")}>
      {config?.label ?? status}
    </span>
  )
}

// ─── Dialogs ──────────────────────────────────────────────

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog: Esc and backdrop close it, Tab stays inside, the page behind does not scroll,
 * and focus returns to the element that opened it.
 */
export function Modal({ title, onClose, children, footer, size = "md", busy = false, role = "dialog" }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  size?: "sm" | "md" | "lg"
  busy?: boolean
  role?: "dialog" | "alertdialog"
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    panelRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== "Tab" || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) { event.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panelRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-card shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 sm:rounded-2xl",
          size === "sm" && "sm:max-w-sm", size === "md" && "sm:max-w-lg", size === "lg" && "sm:max-w-3xl",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id={titleId} className="font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={() => !busy && onClose()} disabled={busy} aria-label="Yopish" className={buttonClass.icon}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel, busy, error, danger = true, onConfirm, onCancel }: {
  title: string
  message: React.ReactNode
  confirmLabel: string
  busy?: boolean
  error?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      busy={busy}
      role="alertdialog"
      footer={
        <>
          <button type="button" className={buttonClass.ghost} onClick={onCancel} disabled={busy}>Bekor</button>
          <button type="button" className={danger ? buttonClass.danger : buttonClass.primary} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground">{message}</div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </Modal>
  )
}

export function Spinner({ label = "Yuklanmoqda" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}
