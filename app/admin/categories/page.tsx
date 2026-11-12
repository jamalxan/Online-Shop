"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Plus, Edit2, Trash2, X, Upload, Check, Loader2, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  adminCreateCategory, adminDeleteCategory, adminGetCategories, adminUpdateCategory,
} from "@/lib/api"
import type { Category } from "@/lib/types"

const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [name, setName] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await adminGetCategories()
    if (res.ok) { setCategories(res.data); setLoadError("") }
    else setLoadError(res.error)
    setLoading(false)
  }, [])

  const openNew = useCallback(() => {
    setEditCat(null); setName(""); setPhoto(null); setPhotoPreview(""); setFormError(""); setShowForm(true)
  }, [])

  useEffect(() => {
    void load()
    // "Yangi kategoriya" quick action on the dashboard links here with ?new=1
    if (new URLSearchParams(window.location.search).get("new") === "1") openNew()
  }, [load, openNew])

  // release object URLs created for local previews
  useEffect(() => {
    if (!photoPreview.startsWith("blob:")) return
    return () => URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  function openEdit(c: Category) {
    setEditCat(c); setName(c.name); setPhotoPreview(c.image === "/placeholder.jpg" ? "" : c.image)
    setPhoto(null); setFormError(""); setShowForm(true)
  }

  function handleFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/")) { setFormError("Faqat rasm fayllari qabul qilinadi"); return }
    if (file.size > MAX_PHOTO_BYTES) { setFormError("Rasm hajmi 5 MB dan oshmasligi kerak"); return }
    setFormError("")
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSave() {
    const title = name.trim()
    if (!title || saving) return
    setSaving(true)
    setFormError("")
    const res = editCat
      ? await adminUpdateCategory(editCat.id, title, photo)
      : await adminCreateCategory(title, photo)
    setSaving(false)
    if (!res.ok) {
      setFormError(res.error) // keep the form open — nothing was saved
      return
    }
    setShowForm(false)
    await load()
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setDeleteError("")
    const res = await adminDeleteCategory(deleteTarget.id)
    setDeleting(false)
    if (!res.ok) {
      setDeleteError(res.error)
      return
    }
    setDeleteTarget(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kategoriyalar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{loading ? "…" : `${categories.length} ta kategoriya`}</p>
        </div>
        <Button onClick={openNew} className="rounded-xl gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" /> Yangi kategoriya
        </Button>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={() => { setLoading(true); void load() }} className="font-medium underline">Qayta urinish</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-secondary aspect-square animate-pulse" />
          ))}
        </div>
      ) : categories.length === 0 && !loadError ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Kategoriyalar yo'q</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {categories.map(cat => (
            <div key={cat.id} className="group relative rounded-2xl border border-border bg-card overflow-hidden hover:shadow-md transition-all">
              <div className="aspect-square relative bg-secondary">
                {cat.image && cat.image !== '/placeholder.jpg' ? (
                  <Image src={cat.image} alt="" fill sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw" className="object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Tag className="h-12 w-12 text-muted-foreground opacity-30" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{cat.name}</p>
                  {cat.productsCount !== undefined && (
                    <p className="text-xs text-muted-foreground">{cat.productsCount} ta mahsulot</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => openEdit(cat)} aria-label={`${cat.name} — tahrirlash`} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                    <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(cat) }} aria-label={`${cat.name} — o'chirish`} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={editCat ? "Kategoriyani tahrirlash" : "Yangi kategoriya"}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && setShowForm(false)} aria-hidden="true" />
          <form
            className="relative z-10 w-full max-w-sm bg-card rounded-2xl shadow-2xl overflow-hidden"
            onSubmit={(e) => { e.preventDefault(); void handleSave() }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold">{editCat ? "Kategoriyani tahrirlash" : "Yangi kategoriya"}</h2>
              <button type="button" onClick={() => !saving && setShowForm(false)} aria-label="Yopish"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div className="p-5 space-y-4">
              <button
                type="button"
                aria-label="Rasm yuklash"
                className="relative block h-40 w-full rounded-xl border-2 border-dashed border-border bg-secondary cursor-pointer overflow-hidden hover:border-foreground/30 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {photoPreview ? (
                  // local blob previews are not optimizable
                  <Image src={photoPreview} alt="" fill sizes="384px" className="object-cover" unoptimized={photoPreview.startsWith("blob:")} />
                ) : (
                  <span className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                    <Upload className="h-8 w-8" aria-hidden="true" />
                    <span className="text-xs">Rasm yuklash</span>
                  </span>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = "" }} />
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Kategoriya nomi"
                aria-label="Kategoriya nomi"
                maxLength={100}
                required
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              />
              {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setShowForm(false)} disabled={saving}>Bekor</Button>
              <Button type="submit" className="flex-1 rounded-xl" disabled={!name.trim() || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" /> : <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />}
                Saqlash
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label="Kategoriyani o'chirish">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-xs bg-card rounded-2xl p-6 shadow-2xl text-center">
            <p className="font-semibold mb-2">&ldquo;{deleteTarget.name}&rdquo; o'chirilsinmi?</p>
            <p className="text-sm text-muted-foreground mb-5">Bu amalni bekor qilib bo'lmaydi.</p>
            {deleteError && <p role="alert" className="mb-4 text-sm text-red-600">{deleteError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteTarget(null)} disabled={deleting}>Bekor</Button>
              <Button variant="destructive" className="flex-1 rounded-xl" onClick={handleDelete} disabled={deleting}>
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
