"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  User,
  Package,
  Heart,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Eye,
  EyeOff,
  Mail,
  Phone,
  Lock,
  Loader2,
  CheckCircle,
} from "lucide-react"
import {
  sendVerifyEmail,
  verifyOtp,
  register,
  login,
  updateProfile,
  changePassword,
  safeRedirectPath,
  type UserProfile,
} from "@/lib/api"
import { useStore } from "@/lib/store-context"

// ─── Tab types ────────────────────────────────────────────
type AuthTab = "login" | "register"
type RegisterStep = "form" | "verify-email" | "verify-otp"

// ─── Register multi-step ──────────────────────────────────
function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<RegisterStep>("form")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [otpCode, setOtpCode] = useState("")
  const [otpSent, setOtpSent] = useState(false)

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    phone_number: "",
    password: "",
  })

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    const res = await sendVerifyEmail(form.email)
    setLoading(false)
    if (!res.ok) { setError(res.error || "Xatolik"); return }
    setOtpSent(true)
    setStep("verify-otp")
  }

  // Step 2: Verify OTP then register
  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const verifyRes = await verifyOtp(form.email, otpCode)
    if (!verifyRes.ok) { setLoading(false); setError(verifyRes.error || "Kod xato"); return }

    const regRes = await register(form)
    setLoading(false)
    if (!regRes.ok) { setError(regRes.error || "Ro'yxatdan o'tishda xatolik"); return }

    onSuccess()
  }

  if (step === "verify-otp") {
    return (
      <form onSubmit={handleVerifyAndRegister} className="space-y-6">
        <div className="text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-3" />
          <p className="text-sm text-muted-foreground">
            <strong>{form.email}</strong> manziliga kod yuborildi
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">Tasdiqlash kodi (6 xonali)</label>
          <input aria-label="Tasdiqlash kodi (6 xonali)"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="mt-2 w-full rounded-xl border border-border bg-background py-3 px-4 text-center text-lg tracking-widest outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading || otpCode.length < 6}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Tasdiqlash va ro'yxatdan o'tish
        </Button>
        <button
          type="button"
          onClick={() => { setStep("form"); setOtpCode(""); setError("") }}
          className="w-full text-sm text-muted-foreground hover:text-foreground"
        >
          Orqaga
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSendOtp} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Ism</label>
          <input aria-label="Ism" value={form.first_name} onChange={set("first_name")}
            placeholder="Ism" required
            className="mt-2 w-full rounded-xl border border-border bg-background py-3 px-4 outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-sm font-medium">Familiya</label>
          <input aria-label="Familiya" value={form.last_name} onChange={set("last_name")}
            placeholder="Familiya" required
            className="mt-2 w-full rounded-xl border border-border bg-background py-3 px-4 outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Username</label>
        <input aria-label="Username" value={form.username} onChange={set("username")}
          placeholder="username" required
          className="mt-2 w-full rounded-xl border border-border bg-background py-3 px-4 outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div>
        <label className="text-sm font-medium">Email</label>
        <div className="relative mt-2">
          <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Email" type="email" autoComplete="email" value={form.email} onChange={set("email")}
            placeholder="email@example.com" required
            className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Telefon</label>
        <div className="relative mt-2">
          <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Telefon" type="tel" autoComplete="tel" value={form.phone_number} onChange={set("phone_number")}
            placeholder="+998901234567" required
            className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Parol</label>
        <div className="relative mt-2">
          <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Parol" type={showPass ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={set("password")}
            placeholder="Kamida 8 ta belgi" minLength={8} required
            className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-12 outline-none focus:ring-2 focus:ring-ring" />
          <button type="button" onClick={() => setShowPass(!showPass)}
            aria-label={showPass ? "Parolni yashirish" : "Parolni ko'rsatish"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Email tasdiqlash kodi yuborish
      </Button>
    </form>
  )
}

// ─── Login form ───────────────────────────────────────────
function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [adminOnly, setAdminOnly] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError("")
    setAdminOnly(false)
    setLoading(true)
    const res = await login(email.trim(), password)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      setAdminOnly(Boolean(res.adminOnly))
      return
    }
    onSuccess()
  }

  return (
    <form onSubmit={handleLogin} className="space-y-6">
      <div>
        <label className="text-sm font-medium">Email</label>
        <div className="relative mt-2">
          <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com" required
            className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Parol</label>
        <div className="relative mt-2">
          <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Parol" type={showPass ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Parolingiz" required
            className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-12 outline-none focus:ring-2 focus:ring-ring" />
          <button type="button" onClick={() => setShowPass(!showPass)}
            aria-label={showPass ? "Parolni yashirish" : "Parolni ko'rsatish"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}{" "}
          {adminOnly && (
            <Link href="/admin/login" className="font-medium underline">
              Admin panelga kirish
            </Link>
          )}
        </p>
      )}
      <div className="flex justify-end text-sm">
        <Link href="/forgot-password" className="text-foreground hover:underline">
          Parolni unutdingizmi?
        </Link>
      </div>
      <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Kirish
      </Button>
    </form>
  )
}

// ─── Dashboard (logged in) ────────────────────────────────
function Dashboard({ user, onLogout, onProfileSaved }: {
  user: UserProfile
  onLogout: () => void
  onProfileSaved: () => Promise<unknown>
}) {
  const [editMode, setEditMode] = useState(false)
  const [changingPass, setChangingPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [profileForm, setProfileForm] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
  })

  const [passForm, setPassForm] = useState({
    old_password: "",
    new_password: "",
    confirm_password: "",
  })

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(""); setSuccess("")
    setLoading(true)
    // email is read-only on the backend and is never sent
    const res = await updateProfile(profileForm)
    if (res.ok) await onProfileSaved() // show the saved values, not the stale ones
    setLoading(false)
    if (!res.ok) { setError(res.error || "Xatolik"); return }
    setSuccess("Profil yangilandi!")
    setEditMode(false)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(""); setSuccess("")
    if (passForm.new_password !== passForm.confirm_password) {
      setError("Parollar mos kelmadi!"); return
    }
    setLoading(true)
    const res = await changePassword(passForm.old_password, passForm.new_password, passForm.confirm_password)
    setLoading(false)
    if (!res.ok) { setError(res.error || "Xatolik"); return }
    setSuccess("Parol o'zgartirildi!")
    setChangingPass(false)
    setPassForm({ old_password: "", new_password: "", confirm_password: "" })
  }

  const menuItems = [
    { icon: Package, label: "Buyurtmalarim", href: "/account/orders" },
    { icon: Heart, label: "Sevimlilar", href: "/wishlist" },
    ...(user.is_staff ? [{ icon: ShieldCheck, label: "Admin panel", href: "/admin" }] : []),
  ]

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen bg-background pt-24 pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
            <Link href="/" className="hover:text-foreground">Bosh sahifa</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground">Mening hisobim</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-4 pb-6 border-b border-border">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-xl font-semibold">
                    {(user.first_name || user.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-semibold">{user.first_name} {user.last_name}</h2>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <nav className="mt-6 space-y-1">
                  {menuItems.map((item) => (
                    <Link key={item.label} href={item.href}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm hover:bg-secondary transition-colors">
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                  <button onClick={onLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                    <LogOut className="h-5 w-5" />
                    Chiqish
                  </button>
                </nav>
              </div>
            </div>

            {/* Main */}
            <div className="lg:col-span-3 space-y-8">
              {/* Alert */}
              {(error || success) && (
                <div role={error ? "alert" : "status"} className={`rounded-xl p-4 text-sm ${error ? "bg-red-50 text-red-600 border border-red-200" : "bg-green-50 text-green-600 border border-green-200"}`}>
                  {error || success}
                </div>
              )}

              {/* Profile Card */}
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-lg">Profil ma'lumotlari</h3>
                  {!editMode && (
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setEditMode(true)}>
                      Tahrirlash
                    </Button>
                  )}
                </div>

                {editMode ? (
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Ism</label>
                        <input aria-label="Ism" value={profileForm.first_name}
                          onChange={(e) => setProfileForm(f => ({ ...f, first_name: e.target.value }))}
                          className="mt-2 w-full rounded-xl border border-border bg-background py-2.5 px-4 outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Familiya</label>
                        <input aria-label="Familiya" value={profileForm.last_name}
                          onChange={(e) => setProfileForm(f => ({ ...f, last_name: e.target.value }))}
                          className="mt-2 w-full rounded-xl border border-border bg-background py-2.5 px-4 outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Username</label>
                        <input aria-label="Username" value={profileForm.username}
                          onChange={(e) => setProfileForm(f => ({ ...f, username: e.target.value }))}
                          className="mt-2 w-full rounded-xl border border-border bg-background py-2.5 px-4 outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Email (o'zgartirib bo'lmaydi)</label>
                        <input aria-label="Email (o'zgartirib bo'lmaydi)" value={user.email} disabled readOnly
                          className="mt-2 w-full rounded-xl border border-border bg-secondary py-2.5 px-4 opacity-60" />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button type="submit" className="rounded-xl" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Saqlash
                      </Button>
                      <Button type="button" variant="outline" className="rounded-xl" onClick={() => { setEditMode(false); setError("") }}>
                        Bekor qilish
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-muted-foreground">Ism</label>
                      <p className="mt-1 font-medium">{user.first_name}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Familiya</label>
                      <p className="mt-1 font-medium">{user.last_name}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Username</label>
                      <p className="mt-1 font-medium">@{user.username}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Email</label>
                      <p className="mt-1 font-medium">{user.email}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Telefon</label>
                      <p className="mt-1 font-medium">{user.phone_number || "—"}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Change Password */}
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-lg">Parolni o'zgartirish</h3>
                  {!changingPass && (
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setChangingPass(true)}>
                      O'zgartirish
                    </Button>
                  )}
                </div>
                {changingPass ? (
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    {(["old_password", "new_password", "confirm_password"] as const).map((key) => (
                      <div key={key}>
                        <label className="text-sm font-medium">
                          {key === "old_password" ? "Eski parol" : key === "new_password" ? "Yangi parol" : "Yangi parolni tasdiqlash"}
                        </label>
                        <div className="relative mt-2">
                          <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input type="password" value={passForm[key]}
                            aria-label={key === "old_password" ? "Eski parol" : key === "new_password" ? "Yangi parol" : "Yangi parolni tasdiqlash"}
                            autoComplete={key === "old_password" ? "current-password" : "new-password"}
                            onChange={(e) => setPassForm(f => ({ ...f, [key]: e.target.value }))}
                            minLength={8} required
                            className="w-full rounded-xl border border-border bg-background py-2.5 pl-11 pr-4 outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-3 pt-2">
                      <Button type="submit" className="rounded-xl" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Saqlash
                      </Button>
                      <Button type="button" variant="outline" className="rounded-xl" onClick={() => { setChangingPass(false); setError("") }}>
                        Bekor qilish
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">Parolni yangilash uchun tugmani bosing.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────
export default function AccountPage() {
  const router = useRouter()
  const { user, authReady, refreshUser, logout, refreshCart } = useStore()
  const [activeTab, setActiveTab] = useState<AuthTab>("login")
  const [registered, setRegistered] = useState(false)

  const handleAuthSuccess = async () => {
    await refreshUser()
    await refreshCart() // merges the guest cart into the account cart
    // ?next= is only honoured for same-site paths (no open redirect)
    const next = new URLSearchParams(window.location.search).get("next")
    if (next) router.replace(safeRedirectPath(next))
  }

  if (!authReady) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center" role="status" aria-label="Yuklanmoqda">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
        <Footer />
      </>
    )
  }

  if (user) {
    return <Dashboard user={user} onLogout={logout} onProfileSaved={refreshUser} />
  }

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen bg-background pt-24 pb-20">
        <div className="mx-auto max-w-md px-4 sm:px-6">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
            <Link href="/" className="hover:text-foreground">Bosh sahifa</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground">Hisob</span>
          </nav>

          <div className="rounded-2xl border border-border bg-card p-8">
            {/* Tabs */}
            <div className="flex rounded-xl bg-secondary p-1 mb-8">
              {(["login", "register"] as AuthTab[]).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors",
                    activeTab === tab ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}>
                  {tab === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
                </button>
              ))}
            </div>

            {registered && activeTab === "login" && (
              <p role="status" className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                Ro'yxatdan o'tdingiz. Endi hisobingizga kiring.
              </p>
            )}

            {activeTab === "login" ? (
              <LoginForm onSuccess={handleAuthSuccess} />
            ) : (
              <RegisterForm onSuccess={() => { setRegistered(true); setActiveTab("login") }} />
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
