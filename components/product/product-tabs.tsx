"use client"

import { useState } from "react"
import { cn, formatPrice } from "@/lib/utils"
import type { ColorVariant, StorageOption } from "@/lib/types"

interface ProductTabsProps {
  description?: string
  category?: string
  storageOptions: StorageOption[]
  colorVariants: ColorVariant[]
}

type TabId = "description" | "specs"

/** Only real product data is shown here — there is no reviews backend, so no reviews/ratings. */
export function ProductTabs({ description, category, storageOptions, colorVariants }: ProductTabsProps) {
  const specs: { name: string; value: string }[] = []
  if (category) specs.push({ name: "Kategoriya", value: category })
  if (colorVariants.length > 0) {
    specs.push({ name: "Ranglar", value: colorVariants.map((c) => c.name).join(", ") })
  }
  storageOptions.forEach((option) => {
    specs.push({
      name: option.ram ? `${option.storage} / ${option.ram}` : option.storage,
      value: formatPrice(option.price),
    })
  })

  const tabs: { id: TabId; label: string }[] = []
  if (description?.trim()) tabs.push({ id: "description", label: "Tavsif" })
  if (specs.length > 0) tabs.push({ id: "specs", label: "Xususiyatlar" })

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0]?.id ?? "description")

  if (tabs.length === 0) return null

  return (
    <section className="border-t border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {/* Tab Navigation */}
        <div role="tablist" aria-label="Mahsulot ma'lumotlari" className="flex flex-wrap gap-2 border-b border-border pb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`product-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`product-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-full px-6 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                activeTab === tab.id
                  ? "bg-foreground text-background"
                  : "bg-background text-foreground hover:bg-muted"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          {activeTab === "description" && description?.trim() && (
            <div
              role="tabpanel"
              id="product-panel-description"
              aria-labelledby="product-tab-description"
              className="rounded-3xl bg-background p-8"
            >
              <h2 className="text-2xl font-semibold">Mahsulot haqida</h2>
              {/* rendered as text (never as HTML) */}
              <p className="mt-4 text-muted-foreground leading-relaxed whitespace-pre-line">{description}</p>
            </div>
          )}

          {activeTab === "specs" && specs.length > 0 && (
            <div
              role="tabpanel"
              id="product-panel-specs"
              aria-labelledby="product-tab-specs"
              className="rounded-3xl bg-background overflow-hidden"
            >
              <table className="w-full">
                <caption className="sr-only">Mahsulot xususiyatlari</caption>
                <tbody>
                  {specs.map((spec, index) => (
                    <tr
                      key={`${spec.name}-${index}`}
                      className={cn(
                        "border-b border-border last:border-0",
                        index % 2 === 0 && "bg-secondary/30"
                      )}
                    >
                      <th scope="row" className="px-6 py-4 text-left text-sm font-medium w-1/3">
                        {spec.name}
                      </th>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {spec.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
