"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminLoginResend, adminLoginStart, adminLoginVerify, logout as endSession } from "@/lib/api"
import { useStore } from "@/lib/store-context"

const RESEND_SECONDS = 60
const CODE_LENGTH = 6

type Step = "credentials" | "code"

export default function AdminLoginPage() {
  const router = useRouter()
  const { user, authReady, refreshUser, refreshCart } = useStore()

  const [step, setStep] = useState<Step>("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [challenge, setChallenge] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [secondsLeft, setSecondsLeft] = useState(0)
  const busyRef = useRef(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  // Already signed in as staff → straight to the panel.
  useEffect(() => {
    if (authReady && user?.is_staff) router.replace("/admin")
  }, [authReady, user, router])

  // Resend countdown
  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft])

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus()
  }, [step])

  function backToCredentials(message = "") {
    setStep("credentials")
    setChallenge("")
    setCode("")
    setPassword("")
    setInfo("")
    setError(message)
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setError("")
    setInfo("")
    setLoading(true)
    const res = await adminLoginStart(email.trim(), password)
    setLoading(false)
    busyRef.current = false
    if (!res.ok) {
      setError(res.error)
      return
    }
    setChallenge(res.data.challenge)
    setMaskedEmail(res.data.email)
    setPassword("") // not needed any more — don't keep it in memory
    setCode("")
    setSecondsLeft(RESEND_SECONDS)
    setStep("code")
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (busyRef.current || code.length !== CODE_LENGTH) return
    busyRef.current = true
    setError("")
    setInfo("")
    setLoading(true)
    const res = await adminLoginVerify(challenge, code)
    if (!res.ok) {
      setLoading(false)
      busyRef.current = false
      setCode("")
      // 429 = too many wrong codes: the challenge is dead, start again
      if (res.status === 429) backToCredentials(res.error)
      else setError(res.error)
      return
    }
    const profile = await refreshUser()
    if (!profile?.is_staff) {
      // a session for a non-staff profile must not linger: revoke it and drop the cookie
      endSession()
      await refreshUser()
      setLoading(false)
      busyRef.current = false
      backToCredentials("Bu hisobda admin huquqi yo'q")
      return
    }
    void refreshCart()
    router.replace("/admin")
  }

  async function handleResend() {
    if (resending || secondsLeft > 0) return
    setResending(true)
    setError("")
    setInfo("")
    const res = await adminLoginResend(challenge)
    setResending(false)
    if (!res.ok) {
      // an expired session (400) cannot be resumed
      if (res.status === 400) backToCredentials(res.error)
      else setError(res.error)
      return
    }
    setSecondsLeft(RESEND_SECONDS)
    setInfo("Yangi kod yuborildi")
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-background py-3 pl-12 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <main id="main-content" className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground">
            <span className="text-background font-bold" aria-hidden="true">A</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold">APEX Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "credentials" ? "Admin panelga kirish" : "Ikki bosqichli tasdiqlash"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {error && (
            <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {info}
            </p>
          )}

          {step === "credentials" ? (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <label htmlFor="admin-email" className="text-sm font-medium">Email</label>
                <div className="relative mt-1.5">
                  <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="admin@example.com"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="admin-password" className="text-sm font-medium">Parol</label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Davom etish
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-secondary p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{maskedEmail}</span> manziliga {CODE_LENGTH} xonali kod yuborildi.
                </p>
              </div>
              <div>
                <label htmlFor="admin-code" className="text-sm font-medium">Tasdiqlash kodi</label>
                <input
                  id="admin-code"
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={CODE_LENGTH}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background py-3 px-4 text-center text-lg tracking-[0.5em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="••••••"
                />
              </div>
              <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading || code.length !== CODE_LENGTH}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Kirish
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => backToCredentials()}
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Orqaga
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || secondsLeft > 0}
                  className="font-medium hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
                >
                  {secondsLeft > 0
                    ? <span className="tabular-nums">Qayta yuborish ({secondsLeft}s)</span>
                    : resending ? "Yuborilmoqda..." : "Kodni qayta yuborish"}
                </button>
              </div>
            </form>
          )}
        </div>

        <Link href="/" className="mt-4 flex items-center justify-center rounded-xl border border-border py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors">
          Do'konga qaytish
        </Link>
      </div>
    </main>
  )
}
