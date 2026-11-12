"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import {
  Plus, Search, Edit2, Trash2, X, Upload, Check,
  AlertTriangle, Loader2, Package,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FilterTabs, PageHeader, Pagination, buttonClass, inputClass, useDebounced } from "@/components/admin/ui"
import { cn, currencyUnit, formatPrice, safeHex } from "@/lib/utils"
import {
  adminGetProducts, adminGetProduct, adminCreateProduct, adminUpdateProduct, adminDeleteProduct,
  adminAddColorVariant, adminUploadColorPhotos, adminAddStorageOption, adminUpdateStorageOption,
  adminDeleteColorVariant, adminDeleteStorageOption, adminGetCategories,
  adminUploadProductPhotos, adminDeleteProductPhoto, adminDeleteColorPhoto,
} from "@/lib/api"
import type { Product, Category } from "@/lib/types"

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_GALLERY_UPLOAD = 10

type StockFilter = "all" | "active" | "inactive" | "low" | "out"
const STOCK_FILTERS: readonly (readonly [StockFilter, string])[] = [
  ["all", "Barchasi"], ["active", "Faol"], ["inactive", "Nofaol"], ["low", "Kam qolgan"], ["out", "Tugagan"],
]

function validImages(files: File[]): File[] {
  return files.filter((f) => f.type.startsWith("image/") && f.size <= MAX_IMAGE_BYTES)
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [variantBusy, setVariantBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<"basic" | "gallery" | "colors" | "storage">("basic")
  // server-side list state
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [stockFilter, setStockFilter] = useState<StockFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState("")
  const q = useDebounced(search.trim())
  // gallery photos queued for upload on save
  const [galleryFiles, setGalleryFiles] = useState<File[]>([])
  // price edits of existing storage options: option id → text in the input
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({})

  // Form state
  const [form, setForm] = useState({
    title: "", description: "", price: "", discount: "0",
    quantity: "", category: "", is_active: true,
  })
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState("")

  // Color variants form
  const [colorName, setColorName] = useState("")
  const [colorHex, setColorHex] = useState("#000000")
  const [colorPhotos, setColorPhotos] = useState<File[]>([])

  // Storage options form
  const [storageLabel, setStorageLabel] = useState("")
  const [storageValue, setStorageValue] = useState("")
  const [ramValue, setRamValue] = useState("")
  const [storagePrice, setStoragePrice] = useState("")
  // variants queued in the form — sent to the API on save
  const [localStorageOptions, setLocalStorageOptions] = useState<{ label: string; storage: string; ram: string; price: string }[]>([])
  const [localColorVariants, setLocalColorVariants] = useState<{ name: string; hex: string; photos: File[] }[]>([])

  const fileRef = useRef<HTMLInputElement>(null)
  const handledQuery = useRef(false)

  const load = useCallback(async (): Promise<void> => {
    const [prods, cats] = await Promise.all([
      adminGetProducts({
        page, q,
        state: stockFilter === "all" ? "" : stockFilter,
        category: categoryFilter ? Number(categoryFilter) : "",
      }),
      adminGetCategories(),
    ])
    if (prods.ok) {
      setProducts(prods.data.results)
      setPages(prods.data.pages)
      setTotal(prods.data.count)
    }
    if (cats.ok) setCategories(cats.data)
    setLoadError(!prods.ok ? prods.error : !cats.ok ? cats.error : "")
    setLoading(false)
  }, [page, q, stockFilter, categoryFilter])

  /** Re-reads one product (the open one) straight from the server. */
  const refreshEditProduct = useCallback(async (id: string) => {
    const res = await adminGetProduct(id)
    if (res.ok) setEditProduct(res.data)
    return res.ok ? res.data : null
  }, [])

  const resetVariantForms = useCallback(() => {
    setLocalStorageOptions([])
    setLocalColorVariants([])
    setGalleryFiles([])
    setPriceDrafts({})
    setColorName(""); setColorHex("#000000"); setColorPhotos([])
    setStorageLabel(""); setStorageValue(""); setRamValue(""); setStoragePrice("")
    setSaveError("")
    setActiveTab("basic")
  }, [])

  const openNew = useCallback(() => {
    setEditProduct(null)
    setForm({ title: "", description: "", price: "", discount: "0", quantity: "", category: "", is_active: true })
    setThumbnail(null)
    setThumbnailPreview("")
    resetVariantForms()
    setShowForm(true)
  }, [resetVariantForms])

  const openEdit = useCallback((p: Product) => {
    setEditProduct(p)
    setForm({
      title: p.name,
      description: p.description ?? "",
      // the stored base price — NOT the discounted / cheapest-option display price
      price: String(p.basePrice),
      discount: String(p.discount ?? 0),
      quantity: String(p.quantity),
      category: String(p.categoryId ?? ""),
      is_active: p.isActive ?? true,
    })
    setThumbnailPreview(p.image === "/placeholder.jpg" ? "" : p.image)
    setThumbnail(null)
    resetVariantForms()
    setShowForm(true)
  }, [resetVariantForms])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    // dashboard links: /admin/products?new=1 and ?edit=<id> (the product may not be on the first page)
    if (handledQuery.current) return
    handledQuery.current = true
    const params = new URLSearchParams(window.location.search)
    const editId = params.get("edit")
    if (params.get("new") === "1") openNew()
    else if (editId && /^\d+$/.test(editId)) {
      void adminGetProduct(editId).then((res) => { if (res.ok) openEdit(res.data) })
    }
  }, [openNew, openEdit])

  // release object URLs created for local previews
  useEffect(() => {
    if (!thumbnailPreview.startsWith("blob:")) return
    return () => URL.revokeObjectURL(thumbnailPreview)
  }, [thumbnailPreview])

  // Some payloads carry the category only by name — resolve it against the category list.
  const selectedCategory =
    form.category ||
    (editProduct ? String(categories.find((c) => c.name === editProduct.category)?.id ?? "") : "")

  async function handleSave() {
    if (saving) return
    const price = Number(form.price)
    const discount = Number(form.discount || 0)
    const quantity = Number(form.quantity || 0)
    if (!form.title.trim()) { setSaveError("Mahsulot nomini kiriting"); setActiveTab("basic"); return }
    if (!Number.isFinite(price) || price <= 0) { setSaveError("Narx musbat son bo'lishi kerak"); setActiveTab("basic"); return }
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) { setSaveError("Chegirma 0–100 oralig'ida bo'lishi kerak"); setActiveTab("basic"); return }
    if (!Number.isInteger(quantity) || quantity < 0) { setSaveError("Miqdor manfiy bo'lmagan butun son bo'lishi kerak"); setActiveTab("basic"); return }

    setSaving(true)
    setSaveError("")
    const fd = new FormData()
    fd.append("title", form.title.trim())
    fd.append("description", form.description)
    fd.append("price", form.price)
    fd.append("discount", String(discount))
    fd.append("quantity", String(quantity))
    if (selectedCategory) fd.append("category", selectedCategory)
    fd.append("is_active", String(form.is_active))
    if (thumbnail) fd.append("thumbnail_photo", thumbnail)

    let productId: string
    if (editProduct) {
      const res = await adminUpdateProduct(editProduct.id, fd)
      if (!res.ok) { setSaving(false); setSaveError(res.error); return }
      productId = editProduct.id
    } else {
      const res = await adminCreateProduct(fd)
      if (!res.ok) { setSaving(false); setSaveError(res.error); return }
      productId = res.data.id
    }

    // Queued variants (works for new AND existing products). Failures are reported, never hidden;
    // lines that failed stay in the form so they can be retried.
    const problems: string[] = []
    const failedStorage: typeof localStorageOptions = []
    for (const opt of localStorageOptions) {
      const res = await adminAddStorageOption(productId, {
        label: opt.label, storage: opt.storage, ram: opt.ram, price: parseFloat(opt.price),
      })
      if (!res.ok) { problems.push(`Xotira "${opt.label}": ${res.error}`); failedStorage.push(opt) }
    }
    const failedColors: typeof localColorVariants = []
    for (const col of localColorVariants) {
      const res = await adminAddColorVariant(productId, { name: col.name, hex_code: col.hex })
      if (!res.ok) { problems.push(`Rang "${col.name}": ${res.error}`); failedColors.push(col); continue }
      if (col.photos.length > 0) {
        const up = await adminUploadColorPhotos(res.id, col.photos)
        if (!up.ok) problems.push(`"${col.name}" rasmlari: ${up.error}`)
      }
    }

    // price changes of existing storage options
    for (const [id, text] of Object.entries(priceDrafts)) {
      const price = Number(text)
      const option = editProduct?.storageOptions?.find((o) => o.id === Number(id))
      if (!option || !Number.isFinite(price) || price <= 0) continue
      if (price === (option.originalPrice ?? option.price)) continue
      const res = await adminUpdateStorageOption(option.id, { price })
      if (!res.ok) problems.push(`Xotira "${option.label}" narxi: ${res.error}`)
    }
    if (galleryFiles.length > 0) {
      const up = await adminUploadProductPhotos(productId, galleryFiles)
      if (!up.ok) problems.push(`Galereya rasmlari: ${up.error}`)
      else setGalleryFiles([])
    }

    await load()
    setSaving(false)
    if (problems.length > 0) {
      // the product itself is saved — keep the form open on it and show what failed
      await refreshEditProduct(productId)
      setPriceDrafts({})
      setThumbnail(null)
      setLocalStorageOptions(failedStorage)
      setLocalColorVariants(failedColors)
      setSaveError(`Mahsulot saqlandi, lekin: ${problems.join("; ")}`)
      return
    }
    setShowForm(false)
  }

  /** Removes a variant that already exists on the server (edit mode). */
  async function removeExistingVariant(kind: "color" | "storage", id: number) {
    if (variantBusy || !editProduct) return
    setVariantBusy(true)
    setSaveError("")
    const res = kind === "color" ? await adminDeleteColorVariant(id) : await adminDeleteStorageOption(id)
    if (!res.ok) {
      setSaveError(res.error)
    } else {
      await Promise.all([load(), refreshEditProduct(editProduct.id)])
    }
    setVariantBusy(false)
  }

  /** Deletes one picture that already exists on the server (gallery or colour photo). */
  async function removeExistingPhoto(kind: "gallery" | "color", id: number) {
    if (variantBusy || !editProduct) return
    setVariantBusy(true)
    setSaveError("")
    const res = kind === "gallery" ? await adminDeleteProductPhoto(id) : await adminDeleteColorPhoto(id)
    if (!res.ok) setSaveError(res.error)
    else await refreshEditProduct(editProduct.id)
    setVariantBusy(false)
  }

  async function handleDelete(id: string) {
    if (deleting) return
    setDeleting(true)
    setDeleteError("")
    const res = await adminDeleteProduct(id)
    setDeleting(false)
    if (!res.ok) {
      // e.g. 409: the product has orders — the server message says to deactivate it instead
      setDeleteError(res.error)
      return
    }
    setDeleteId(null)
    await load()
  }

  // search and filters are applied by the server
  const filtered = products
  const hasFilters = Boolean(q) || stockFilter !== "all" || Boolean(categoryFilter)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mahsulotlar"
        description={loading ? "Yuklanmoqda…" : `${total} ta mahsulot`}
        actions={
          <button type="button" onClick={openNew} className={buttonClass.accent}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Yangi mahsulot
          </button>
        }
      />

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={() => { setLoading(true); void load() }} className="font-medium underline">Qayta urinish</button>
        </div>
      )}

      <FilterTabs options={STOCK_FILTERS} value={stockFilter} onChange={(next) => { setStockFilter(next); setPage(1) }} label="Holat bo'yicha filtr" />

      {/* Search + category */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Nom yoki kategoriya bo'yicha qidirish"
            aria-label="Mahsulot qidirish"
            className={cn(inputClass, "bg-card pl-10")}
          />
        </div>
        <select
          aria-label="Kategoriya bo'yicha filtr"
          value={categoryFilter}
          onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
          className={cn(inputClass, "bg-card sm:w-56")}
        >
          <option value="">Barcha kategoriyalar</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Mahsulot</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Kategoriya</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Narx</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Miqdor</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Ranglar</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Xotira</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-secondary animate-pulse shrink-0" />
                        <div className="h-4 w-32 rounded bg-secondary animate-pulse" />
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell"><div className="h-4 w-20 rounded bg-secondary animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-16 rounded bg-secondary animate-pulse" /></td>
                    <td className="py-3 px-4 hidden sm:table-cell"><div className="h-4 w-10 rounded bg-secondary animate-pulse" /></td>
                    <td className="py-3 px-4 hidden lg:table-cell"><div className="h-4 w-12 rounded bg-secondary animate-pulse" /></td>
                    <td className="py-3 px-4 hidden lg:table-cell"><div className="h-4 w-16 rounded bg-secondary animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-16 rounded bg-secondary animate-pulse ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-20" aria-hidden="true" />
                    <p>{hasFilters ? "Bu filtr bo'yicha mahsulot topilmadi" : "Hali mahsulot qo'shilmagan"}</p>
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl overflow-hidden bg-secondary shrink-0">
                          {p.image && <Image src={p.image} alt="" width={40} height={40} className="object-cover w-full h-full" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[180px]">{p.name}</p>
                          {p.discount > 0 && (
                            <span className="text-xs text-red-500 font-medium">-{p.discount}%</span>
                          )}
                          {p.isActive === false && (
                            <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">Nofaol</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{p.category}</td>
                    <td className="py-3 px-4 font-semibold">{formatPrice(p.price)}</td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        p.quantity > 10 ? "bg-green-100 text-green-700" :
                        p.quantity > 0  ? "bg-yellow-100 text-yellow-700" :
                                          "bg-red-100 text-red-600"
                      )}>
                        {p.quantity}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <div className="flex gap-1">
                        {(p.colorVariants || []).slice(0, 5).map(c => (
                          <span key={c.id} className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: safeHex(c.hex) }} title={c.name} />
                        ))}
                        {(p.colorVariants?.length ?? 0) > 5 && (
                          <span className="text-xs text-muted-foreground">+{(p.colorVariants?.length ?? 0) - 5}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(p.storageOptions || []).slice(0, 3).map(s => (
                          <span key={s.id} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs">{s.label}</span>
                        ))}
                        {(p.storageOptions?.length ?? 0) > 3 && (
                          <span className="text-xs text-muted-foreground">+{(p.storageOptions?.length ?? 0) - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          aria-label={`${p.name} — tahrirlash`}
                          className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDeleteError(""); setDeleteId(p.id) }}
                          aria-label={`${p.name} — o'chirish`}
                          className="p-2 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && <Pagination page={page} pages={pages} count={total} onPage={setPage} noun="ta mahsulot" />}
      </div>

      {/* ─── Product Form Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={editProduct ? "Mahsulotni tahrirlash" : "Yangi mahsulot qo'shish"}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && setShowForm(false)} aria-hidden="true" />
          <div className="relative z-10 w-full sm:max-w-2xl bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="font-semibold">{editProduct ? "Mahsulotni tahrirlash" : "Yangi mahsulot qo'shish"}</h2>
              <button type="button" onClick={() => !saving && setShowForm(false)} aria-label="Yopish" className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border px-5 shrink-0 overflow-x-auto">
              {([["basic", "Asosiy"], ["gallery", "Galereya"], ["colors", "Ranglar"], ["storage", "Xotira/RAM"]] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "py-3 px-1 mr-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    activeTab === tab
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                  {tab === "gallery" && galleryFiles.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-foreground text-background text-xs px-1.5 py-0.5">{galleryFiles.length}</span>
                  )}
                  {tab === "colors" && localColorVariants.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-foreground text-background text-xs px-1.5 py-0.5">{localColorVariants.length}</span>
                  )}
                  {tab === "storage" && localStorageOptions.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-foreground text-background text-xs px-1.5 py-0.5">{localStorageOptions.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 p-5">
              {/* ── Basic Tab ── */}
              {activeTab === "basic" && (
                <div className="space-y-4">
                  {/* Thumbnail */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Asosiy rasm</label>
                    <button
                      type="button"
                      aria-label="Asosiy rasmni yuklash"
                      className="relative block h-40 w-40 rounded-xl border-2 border-dashed border-border hover:border-foreground/30 transition-colors cursor-pointer overflow-hidden bg-secondary"
                      onClick={() => fileRef.current?.click()}
                    >
                      {thumbnailPreview ? (
                        <Image src={thumbnailPreview} alt="" fill sizes="160px" className="object-cover" unoptimized={thumbnailPreview.startsWith("blob:")} />
                      ) : (
                        <span className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                          <Upload className="h-8 w-8" aria-hidden="true" />
                          <span className="text-xs">Rasm yuklash</span>
                        </span>
                      )}
                    </button>
                    <input
                      ref={fileRef} type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const [f] = validImages(Array.from(e.target.files || []))
                        if (f) { setThumbnail(f); setThumbnailPreview(URL.createObjectURL(f)); setSaveError("") }
                        else if (e.target.files?.length) setSaveError("Faqat 5 MB gacha bo'lgan rasm fayllari qabul qilinadi")
                        e.target.value = ""
                      }}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium mb-1.5 block">Mahsulot nomi *</label>
                      <input aria-label="Mahsulot nomi *"
                        value={form.title}
                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="iPhone 15 Pro Max"
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Narx ({currencyUnit()}) *</label>
                      <input aria-label={`Narx (${currencyUnit()}) *`}
                        value={form.price} type="number" min="0" step="0.01" inputMode="decimal"
                        onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                        placeholder="999"
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Chegirma (%)</label>
                      <input aria-label="Chegirma (%)"
                        value={form.discount} type="number" min="0" max="100"
                        onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Miqdor *</label>
                      <input aria-label="Miqdor *"
                        value={form.quantity} type="number" min="0"
                        onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                        placeholder="50"
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Kategoriya</label>
                      <select aria-label="Kategoriya"
                        value={selectedCategory}
                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      >
                        <option value="">— Tanlang —</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium mb-1.5 block">Tavsif</label>
                      <textarea aria-label="Tavsif"
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Mahsulot haqida qisqacha tavsif..."
                        rows={3}
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.is_active}
                        aria-label="Faol mahsulot"
                        onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                        className={cn(
                          "h-6 w-11 rounded-full transition-colors relative",
                          form.is_active ? "bg-foreground" : "bg-border"
                        )}
                      >
                        <span className={cn(
                          "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm",
                          form.is_active ? "translate-x-5" : "translate-x-0.5"
                        )} />
                      </button>
                      <span className="text-sm">Faol mahsulot</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Gallery Tab ── */}
              {activeTab === "gallery" && (
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Mahsulot sahifasidagi qo&apos;shimcha rasmlar. Rangga bog&apos;liq rasmlar “Ranglar” bo&apos;limida yuklanadi.
                  </p>

                  {editProduct && (editProduct.gallery?.length ?? 0) > 0 && (
                    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {editProduct.gallery!.map((photo) => (
                        <li key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary">
                          <Image src={photo.url} alt="" fill sizes="160px" className="object-cover" />
                          <button
                            type="button"
                            disabled={variantBusy}
                            onClick={() => void removeExistingPhoto("gallery", photo.id)}
                            aria-label="Rasmni o'chirish"
                            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-black/70 text-white transition-colors hover:bg-red-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-4 transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-foreground/20">
                    <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm">
                      {galleryFiles.length > 0
                        ? `${galleryFiles.length} ta rasm tanlandi — “Saqlash” bosilganda yuklanadi`
                        : `Rasmlarni tanlang (bir martada ${MAX_GALLERY_UPLOAD} tagacha, har biri 5 MB gacha)`}
                    </span>
                    <input
                      type="file" accept="image/*" multiple className="sr-only"
                      onChange={e => {
                        const picked = Array.from(e.target.files || [])
                        const valid = validImages(picked).slice(0, MAX_GALLERY_UPLOAD)
                        setGalleryFiles(valid)
                        setSaveError(valid.length < picked.length ? "Ba'zi fayllar olinmadi: faqat 5 MB gacha rasmlar, bir martada 10 tagacha" : "")
                        e.target.value = ""
                      }}
                    />
                  </label>
                  {galleryFiles.length > 0 && (
                    <button type="button" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setGalleryFiles([])}>
                      Tanlovni bekor qilish
                    </button>
                  )}
                </div>
              )}

              {/* ── Colors Tab ── */}
              {activeTab === "colors" && (
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">Rang variantlarini qo'shing. Har bir rang uchun alohida rasmlar yuklashingiz mumkin.</p>

                  {editProduct && (editProduct.colorVariants?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mavjud ranglar</h3>
                      {editProduct.colorVariants!.map((c) => (
                        <div key={c.id} className="rounded-xl border border-border px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="h-6 w-6 rounded-full border border-border shrink-0" style={{ backgroundColor: safeHex(c.hex) }} />
                            <span className="text-sm font-medium flex-1">{c.name}</span>
                            <span className="text-xs text-muted-foreground">{c.images.length} ta rasm</span>
                            <button type="button" disabled={variantBusy} onClick={() => void removeExistingVariant("color", c.id)} aria-label={`${c.name} rangini o'chirish`} className={buttonClass.icon}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                          {(c.photos?.length ?? 0) > 0 && (
                            <ul className="mt-3 flex flex-wrap gap-2">
                              {c.photos!.map((photo) => (
                                <li key={photo.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-secondary">
                                  <Image src={photo.url} alt="" fill sizes="64px" className="object-cover" />
                                  <button type="button" disabled={variantBusy} onClick={() => void removeExistingPhoto("color", photo.id)} aria-label={`${c.name} rasmini o'chirish`} className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:hidden">
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Added colors list */}
                  {localColorVariants.length > 0 && (
                    <div className="space-y-2">
                      {localColorVariants.map((c, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                          <span className="h-6 w-6 rounded-full border border-border shrink-0" style={{ backgroundColor: c.hex }} />
                          <span className="text-sm font-medium flex-1">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.photos.length} ta rasm</span>
                          <button type="button" onClick={() => setLocalColorVariants(v => v.filter((_, j) => j !== i))} aria-label={`${c.name} rangini olib tashlash`} className="text-muted-foreground hover:text-red-500 transition-colors">
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add color form */}
                  <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
                    <h3 className="text-sm font-medium">Yangi rang qo'shish</h3>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <input
                          value={colorName}
                          onChange={e => setColorName(e.target.value)}
                          aria-label="Rang nomi"
                          placeholder="Space Black"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="color" aria-label="Rang kodi" value={colorHex} onChange={e => setColorHex(e.target.value)} className="h-10 w-10 rounded-xl border border-border cursor-pointer" />
                        <span className="text-xs text-muted-foreground font-mono">{colorHex}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Bu rang uchun rasmlar (ixtiyoriy)</label>
                      <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-border px-3 py-2 hover:bg-secondary transition-colors">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {colorPhotos.length > 0 ? `${colorPhotos.length} ta rasm tanlandi` : "Rasmlarni tanlang"}
                        </span>
                        <input
                          type="file" accept="image/*" multiple className="hidden"
                          onChange={e => setColorPhotos(validImages(Array.from(e.target.files || [])))}
                        />
                      </label>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl w-full"
                      disabled={!colorName.trim()}
                      onClick={() => {
                        setLocalColorVariants(v => [...v, { name: colorName.trim(), hex: colorHex, photos: colorPhotos }])
                        setColorName(""); setColorHex("#000000"); setColorPhotos([])
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1.5" /> Rang qo'shish
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Storage Tab ── */}
              {activeTab === "storage" && (
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Xotira/RAM variantlari va ular uchun narxlarni kiriting.
                    <br />
                    <span className="font-medium">Format:</span> Label: "512/8", Storage: "512GB", RAM: "8GB" (MacBook uchun)
                  </p>

                  {editProduct && (editProduct.storageOptions?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mavjud variantlar</h3>
                      {editProduct.storageOptions!.map((o) => (
                        <div key={o.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                          <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-bold">{o.label}</span>
                          <span className="text-sm flex-1">{o.ram ? `${o.storage} / ${o.ram}` : o.storage}</span>
                          <span className="text-sm text-muted-foreground" aria-hidden="true">{currencyUnit()}</span>
                          <input
                            type="number" min="1" step="1" inputMode="numeric"
                            aria-label={`${o.label} narxi (${currencyUnit()})`}
                            value={priceDrafts[o.id] ?? String(o.originalPrice ?? o.price)}
                            onChange={e => setPriceDrafts(d => ({ ...d, [o.id]: e.target.value }))}
                            className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                          />
                          <button type="button" disabled={variantBusy} onClick={() => void removeExistingVariant("storage", o.id)} aria-label={`${o.label} variantini o'chirish`} className={buttonClass.icon}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Added options */}
                  {localStorageOptions.length > 0 && (
                    <div className="space-y-2">
                      {localStorageOptions.map((s, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                          <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-bold">{s.label}</span>
                          <span className="text-sm flex-1">{s.ram ? `${s.storage} / ${s.ram}` : s.storage}</span>
                          <span className="text-sm font-semibold">{formatPrice(s.price)}</span>
                          <button type="button" onClick={() => setLocalStorageOptions(v => v.filter((_, j) => j !== i))} aria-label={`${s.label} variantini olib tashlash`} className="text-muted-foreground hover:text-red-500 transition-colors">
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add storage form */}
                  <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
                    <h3 className="text-sm font-medium">Yangi variant qo'shish</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Label *</label>
                        <input aria-label="Label *"
                          value={storageLabel} onChange={e => setStorageLabel(e.target.value)}
                          placeholder="512/8"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Storage *</label>
                        <input aria-label="Storage *"
                          value={storageValue} onChange={e => setStorageValue(e.target.value)}
                          placeholder="512GB"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">RAM (MacBook uchun)</label>
                        <input aria-label="RAM (MacBook uchun)"
                          value={ramValue} onChange={e => setRamValue(e.target.value)}
                          placeholder="8GB"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Narx ({currencyUnit()}) *</label>
                        <input aria-label={`Narx (${currencyUnit()}) *`}
                          value={storagePrice} type="number" min="0" step="0.01" inputMode="decimal" onChange={e => setStoragePrice(e.target.value)}
                          placeholder="1299"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                        />
                      </div>
                    </div>
                    <Button
                      size="sm" variant="outline" className="rounded-xl w-full"
                      disabled={!storageLabel.trim() || !storageValue.trim() || !(Number(storagePrice) > 0)}
                      onClick={() => {
                        setLocalStorageOptions(v => [...v, { label: storageLabel.trim(), storage: storageValue.trim(), ram: ramValue.trim(), price: storagePrice }])
                        setStorageLabel(""); setStorageValue(""); setRamValue(""); setStoragePrice("")
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1.5" /> Variant qo'shish
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {saveError && (
              <p role="alert" className="mx-5 mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border shrink-0">
              {(localColorVariants.length > 0 || localStorageOptions.length > 0 || galleryFiles.length > 0 || Object.keys(priceDrafts).length > 0) && (
                <p className="mr-auto text-xs text-muted-foreground">O&apos;zgarishlar “Saqlash” bosilganda yuboriladi</p>
              )}
              <Button variant="outline" className="rounded-xl" onClick={() => setShowForm(false)} disabled={saving}>
                Bekor qilish
              </Button>
              <Button className="rounded-xl min-w-[120px]" onClick={handleSave} disabled={saving || !form.title || !form.price}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saqlanmoqda</> : <><Check className="h-4 w-4 mr-2" />Saqlash</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label="Mahsulotni o'chirish">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleting && setDeleteId(null)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-sm bg-card rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-red-100 mx-auto mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <h2 className="text-center font-semibold mb-2">Mahsulotni o'chirish</h2>
            <p className="text-center text-sm text-muted-foreground mb-6">Bu amalni bekor qilib bo'lmaydi.</p>
            {deleteError && <p role="alert" className="mb-4 text-center text-sm text-red-600">{deleteError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteId(null)} disabled={deleting}>Bekor</Button>
              <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => handleDelete(deleteId)} disabled={deleting}>
                {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />}
                O'chirish
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
