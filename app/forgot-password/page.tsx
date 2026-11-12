"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Button } from "@/components/ui/button"
import { ChevronRight, Mail, Lock, Eye, EyeOff, CheckCircle, ArrowLeft } from "lucide-react"

import { forgotPassword, forgotPasswordVerify, resetPassword } from "@/lib/api"

type Step = "email" | "otp" | "password" | "success"

export default function ForgotPasswordPage() {
    const router = useRouter()

    const [step, setStep] = useState<Step>("email")
    const [email, setEmail] = useState("")
    const [otp, setOtp] = useState(["", "", "", "", "", ""])
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showNew, setShowNew] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    // Timer
    const [timeLeft, setTimeLeft] = useState(60)
    const [canResend, setCanResend] = useState(false)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const otpRefs = useRef<(HTMLInputElement | null)[]>([])
    // bumping this restarts the countdown after a successful resend
    const [resendCount, setResendCount] = useState(0)

    // Start 60s timer when OTP step begins
    useEffect(() => {
        if (step === "otp") {
            setTimeLeft(60)
            setCanResend(false)
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        if (timerRef.current) clearInterval(timerRef.current)
                        setCanResend(true)
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [step, resendCount])

    // ── Step 1: Send email ───────────────────────────────────
    async function handleSendEmail(e: React.FormEvent) {
        e.preventDefault()
        if (loading) return
        setError("")
        setLoading(true)
        const res = await forgotPassword(email.trim())
        setLoading(false)
        if (!res.ok) { setError(res.error); return }
        setOtp(["", "", "", "", "", ""])
        setStep("otp")
    }

    // ── Step 2: Verify OTP ───────────────────────────────────
    async function handleVerifyOtp(e: React.FormEvent) {
        e.preventDefault()
        if (loading) return
        const code = otp.join("")
        if (code.length < 6) { setError("Kodni to'liq kiriting"); return }
        setError("")
        setLoading(true)
        const res = await forgotPasswordVerify(email.trim(), code)
        setLoading(false)
        if (!res.ok) { setError(res.error); return }
        setStep("password")
    }

    // ── Step 3: Reset password ───────────────────────────────
    async function handleResetPassword(e: React.FormEvent) {
        e.preventDefault()
        if (loading) return
        if (newPassword !== confirmPassword) { setError("Parollar mos kelmadi"); return }
        if (newPassword.length < 8) { setError("Parol kamida 8 ta belgidan iborat bo'lishi kerak"); return }
        setError("")
        setLoading(true)
        const res = await resetPassword(email.trim(), newPassword, confirmPassword)
        setLoading(false)
        if (!res.ok) { setError(res.error); return }
        setStep("success")
    }

    // ── Resend OTP ───────────────────────────────────────────
    async function handleResend() {
        if (!canResend || loading) return
        setError("")
        setLoading(true)
        const res = await forgotPassword(email.trim())
        setLoading(false)
        // a rate-limited / failed resend is shown, not silently treated as sent
        if (!res.ok) { setError(res.error); return }
        setOtp(["", "", "", "", "", ""])
        setResendCount((n) => n + 1)
    }

    // ── OTP input handlers ───────────────────────────────────
    function handleOtpChange(index: number, value: string) {
        if (!/^\d*$/.test(value)) return
        const newOtp = [...otp]
        newOtp[index] = value.slice(-1)
        setOtp(newOtp)
        if (value && index < 5) otpRefs.current[index + 1]?.focus()
    }

    function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
        if (e.key === "Backspace" && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus()
        }
    }

    function handleOtpPaste(e: React.ClipboardEvent) {
        e.preventDefault()
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
        const newOtp = ["", "", "", "", "", ""]
        pasted.split("").forEach((char, i) => { newOtp[i] = char })
        setOtp(newOtp)
        otpRefs.current[Math.min(pasted.length, 5)]?.focus()
    }

    const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword
    const passwordsMismatch = newPassword && confirmPassword && newPassword !== confirmPassword

    return (
        <>
            <Header />
            <main id="main-content" className="min-h-screen bg-background pt-24 pb-20">
                <div className="mx-auto max-w-md px-4 sm:px-6">

                    {/* Breadcrumb */}
                    <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
                        <Link href="/" className="hover:text-foreground transition-colors">Bosh sahifa</Link>
                        <ChevronRight className="h-4 w-4" />
                        <Link href="/account" className="hover:text-foreground transition-colors">Hisob</Link>
                        <ChevronRight className="h-4 w-4" />
                        <span className="text-foreground" aria-current="page">Parolni tiklash</span>
                    </nav>

                    <div className="rounded-2xl border border-border bg-card p-8">

                        {/* ── SUCCESS ─────────────────────────────── */}
                        {step === "success" && (
                            <div className="flex flex-col items-center text-center py-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-6">
                                    <CheckCircle className="h-8 w-8 text-green-600" />
                                </div>
                                <h1 className="text-2xl font-semibold mb-2">Parol yangilandi!</h1>
                                <p className="text-muted-foreground mb-8">
                                    Parolingiz muvaffaqiyatli o'zgartirildi. Endi yangi parol bilan kirishingiz mumkin.
                                </p>
                                <Button className="w-full rounded-xl" size="lg" onClick={() => router.push("/account")}>
                                    Kirish sahifasiga o'tish
                                </Button>
                            </div>
                        )}

                        {/* ── STEP 1: EMAIL ───────────────────────── */}
                        {step === "email" && (
                            <>
                                <div className="mb-8">
                                    <h1 className="text-2xl font-semibold">Parolni tiklash</h1>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Email manzilingizni kiriting, tasdiqlash kodi yuboramiz.
                                    </p>
                                </div>

                                <form onSubmit={handleSendEmail} className="space-y-6">
                                    <div>
                                        <label className="text-sm font-medium">Email</label>
                                        <div className="relative mt-2">
                                            <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                            <input
                                                type="email"
                                                aria-label="Email"
                                                autoComplete="email"
                                                placeholder="email@example.com"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-ring transition-all"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>
                                    )}

                                    <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
                                        {loading ? "Yuborilmoqda..." : "Kod yuborish"}
                                    </Button>

                                    <div className="text-center">
                                        <Link href="/account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                                            <ArrowLeft className="h-4 w-4" />
                                            Orqaga qaytish
                                        </Link>
                                    </div>
                                </form>
                            </>
                        )}

                        {/* ── STEP 2: OTP ─────────────────────────── */}
                        {step === "otp" && (
                            <>
                                <div className="mb-8">
                                    <h1 className="text-2xl font-semibold">Kodni kiriting</h1>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        <span className="font-medium text-foreground">{email}</span> manziliga 6 xonali kod yuborildi.
                                    </p>
                                </div>

                                <form onSubmit={handleVerifyOtp} className="space-y-6">
                                    {/* OTP boxes */}
                                    <div className="flex justify-between gap-2">
                                        {otp.map((digit, i) => (
                                            <input
                                                key={i}
                                                ref={(el) => { otpRefs.current[i] = el }}
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete={i === 0 ? "one-time-code" : "off"}
                                                aria-label={`Kodning ${i + 1}-raqami`}
                                                maxLength={1}
                                                value={digit}
                                                onChange={(e) => handleOtpChange(i, e.target.value)}
                                                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                                onPaste={handleOtpPaste}
                                                className="h-14 w-full rounded-xl border border-border bg-background text-center text-xl font-semibold outline-none focus:ring-2 focus:ring-ring transition-all"
                                            />
                                        ))}
                                    </div>

                                    {/* Timer */}
                                    <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {canResend
                          ? "Kod kelmadimi?"
                          : <span>Qayta yuborish mumkin: <span className="font-semibold tabular-nums text-foreground">0:{String(timeLeft).padStart(2, "0")}</span></span>
                      }
                    </span>
                                        <button
                                            type="button"
                                            onClick={handleResend}
                                            disabled={!canResend}
                                            className="font-medium text-foreground hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed transition-colors"
                                        >
                                            Qayta yuborish
                                        </button>
                                    </div>

                                    {error && (
                                        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>
                                    )}

                                    <Button
                                        type="submit"
                                        className="w-full rounded-xl"
                                        size="lg"
                                        disabled={loading || otp.join("").length < 6}
                                    >
                                        {loading ? "Tekshirilmoqda..." : "Tasdiqlash"}
                                    </Button>

                                    <div className="text-center">
                                        <button
                                            type="button"
                                            onClick={() => { setStep("email"); setError("") }}
                                            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                            Email o'zgartirish
                                        </button>
                                    </div>
                                </form>
                            </>
                        )}

                        {/* ── STEP 3: NEW PASSWORD ─────────────────── */}
                        {step === "password" && (
                            <>
                                <div className="mb-8">
                                    <h1 className="text-2xl font-semibold">Yangi parol</h1>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Kamida 8 ta belgidan iborat yangi parol o'rnating.
                                    </p>
                                </div>

                                <form onSubmit={handleResetPassword} className="space-y-5">
                                    {/* New password */}
                                    <div>
                                        <label className="text-sm font-medium">Yangi parol</label>
                                        <div className="relative mt-2">
                                            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                            <input
                                                type={showNew ? "text" : "password"}
                                                aria-label="Yangi parol"
                                                autoComplete="new-password"
                                                minLength={8}
                                                placeholder="Kamida 8 ta belgi"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-12 outline-none focus:ring-2 focus:ring-ring transition-all"
                                                required
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNew(!showNew)}
                                                aria-label={showNew ? "Parolni yashirish" : "Parolni ko'rsatish"}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            >
                                                {showNew ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                            </button>
                                        </div>
                                        {newPassword && (
                                            <div className="mt-2 flex gap-1">
                                                {[...Array(4)].map((_, i) => (
                                                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                                                        newPassword.length >= [4, 6, 8, 10][i]
                                                            ? ["bg-red-400", "bg-yellow-400", "bg-blue-400", "bg-green-500"][i]
                                                            : "bg-border"
                                                    }`} />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Confirm password */}
                                    <div>
                                        <label className="text-sm font-medium">Parolni tasdiqlang</label>
                                        <div className="relative mt-2">
                                            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                            <input
                                                type={showConfirm ? "text" : "password"}
                                                aria-label="Parolni tasdiqlang"
                                                autoComplete="new-password"
                                                placeholder="Parolni qayta kiriting"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className={`w-full rounded-xl border bg-background py-3 pl-12 pr-12 outline-none focus:ring-2 transition-all ${
                                                    passwordsMismatch
                                                        ? "border-destructive focus:ring-destructive/30"
                                                        : passwordsMatch
                                                            ? "border-green-500 focus:ring-green-500/30"
                                                            : "border-border focus:ring-ring"
                                                }`}
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirm(!showConfirm)}
                                                aria-label={showConfirm ? "Parolni yashirish" : "Parolni ko'rsatish"}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            >
                                                {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                            </button>
                                        </div>
                                        {passwordsMismatch && (
                                            <p className="mt-2 text-xs text-destructive">Parollar mos kelmadi</p>
                                        )}
                                        {passwordsMatch && (
                                            <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                                                <CheckCircle className="h-3 w-3" /> Parollar mos keldi
                                            </p>
                                        )}
                                    </div>

                                    {error && (
                                        <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>
                                    )}

                                    <Button
                                        type="submit"
                                        className="w-full rounded-xl"
                                        size="lg"
                                        disabled={loading || !passwordsMatch}
                                    >
                                        {loading ? "Saqlanmoqda..." : "Parolni saqlash"}
                                    </Button>
                                </form>
                            </>
                        )}

                    </div>
                </div>
            </main>
            <Footer />
        </>
    )
}