"use client"

import { useId, useMemo, useState } from "react"
import { formatPrice, toNumber } from "@/lib/utils"

interface Point { date: string; revenue: string; orders: number }

const WIDTH = 720
const HEIGHT = 240
const PAD = { top: 16, right: 12, bottom: 28, left: 12 }

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-")
  return `${day}.${month}`
}

/**
 * Daily revenue as an SVG area chart (no chart library in the bundle).
 * Keyboard users can step through days with ← →; every value is also available
 * to screen readers through the table that follows the picture.
 */
export function RevenueChart({ series }: { series: Point[] }) {
  const gradientId = useId()
  const [active, setActive] = useState<number | null>(null)

  const { points, path, area, max } = useMemo(() => {
    const values = series.map((p) => toNumber(p.revenue))
    const top = Math.max(1, ...values)
    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const step = series.length > 1 ? innerW / (series.length - 1) : 0
    const pts = values.map((value, index) => ({
      x: PAD.left + step * index,
      y: PAD.top + innerH - (value / top) * innerH,
      value,
    }))
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
    const base = PAD.top + innerH
    const fill = pts.length ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z` : ""
    return { points: pts, path: line, area: fill, max: top }
  }, [series])

  if (series.length === 0) return null
  const hasSales = points.some((p) => p.value > 0)
  const current = active !== null ? points[active] : null
  const labelEvery = Math.max(1, Math.ceil(series.length / 7))

  const move = (delta: number) =>
    setActive((index) => Math.min(series.length - 1, Math.max(0, (index ?? series.length - 1) + delta)))

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-60 w-full touch-none select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 xl:h-72"
        role="img"
        aria-label={`Kunlik tushum grafigi, ${series.length} kun. Eng yuqori kun: ${formatPrice(max)}.`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") { event.preventDefault(); move(-1) }
          if (event.key === "ArrowRight") { event.preventDefault(); move(1) }
          if (event.key === "Escape") setActive(null)
        }}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - rect.left) / rect.width) * WIDTH
          const step = series.length > 1 ? (WIDTH - PAD.left - PAD.right) / (series.length - 1) : 1
          setActive(Math.min(series.length - 1, Math.max(0, Math.round((x - PAD.left) / step))))
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - ratio)
          return <line key={ratio} x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 5" />
        })}
        {hasSales && <path d={area} fill={`url(#${gradientId})`} />}
        <path d={path} fill="none" stroke="var(--foreground)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((point, index) =>
          index % labelEvery === 0 || index === series.length - 1 ? (
            <text key={point.date} x={points[index].x} y={HEIGHT - 8} textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
              {shortDate(point.date)}
            </text>
          ) : null,
        )}
        {current && (
          <>
            <line x1={current.x} x2={current.x} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--foreground)" strokeOpacity="0.3" />
            <circle cx={current.x} cy={current.y} r="5" fill="var(--background)" stroke="var(--foreground)" strokeWidth="2.5" />
          </>
        )}
      </svg>

      {current && active !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-xl bg-foreground px-3 py-2 text-xs text-background shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, (current.x / WIDTH) * 100))}%` }}
          aria-hidden="true"
        >
          <p className="text-background/70">{shortDate(series[active].date)}</p>
          <p className="font-semibold tabular-nums">{formatPrice(current.value)}</p>
          <p className="tabular-nums text-background/70">{series[active].orders} ta buyurtma</p>
        </div>
      )}

      {!hasSales && (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground">
          Bu davrda sotuv bo&apos;lmagan
        </p>
      )}

      <figcaption className="sr-only">
        <table>
          <caption>Kunlik tushum</caption>
          <thead><tr><th scope="col">Sana</th><th scope="col">Tushum</th><th scope="col">Buyurtmalar</th></tr></thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.date}><td>{point.date}</td><td>{formatPrice(point.revenue)}</td><td>{point.orders}</td></tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  )
}
