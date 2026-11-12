import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight, MessageCircle } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Savol-javoblar",
  description: "Buyurtma berish, to'lov, yetkazib berish va hisob bo'yicha eng ko'p beriladigan savollarga javoblar.",
}

// Every answer describes what the site really does. Anything that depends on the shop's own
// policy (warranty terms, return periods, delivery prices) points to the contact page instead of guessing.
const faqCategories = [
  {
    title: "Buyurtma",
    questions: [
      {
        question: "Qanday buyurtma beraman?",
        answer: "Mahsulotni tanlang, kerak bo'lsa xotira va rang variantini belgilang va savatga qo'shing. Savatdan “Rasmiylashtirish”ga o'ting, ism, telefon va manzilni kiriting, yetkazib berish usulini tanlang va buyurtmani tasdiqlang.",
      },
      {
        question: "Buyurtma berish uchun ro'yxatdan o'tish shartmi?",
        answer: "Ha. Savatni mehmon sifatida ham to'ldirishingiz mumkin, lekin buyurtmani tasdiqlash uchun hisobga kirish kerak — shunda buyurtma holatini kuzata olasiz. Kirganingizda savatdagi mahsulotlar saqlanib qoladi.",
      },
      {
        question: "Buyurtmam holatini qayerdan bilaman?",
        answer: "“Hisob → Buyurtmalarim” sahifasida. Buyurtma to'rt bosqichdan o'tadi: qabul qilindi, qadoqlanmoqda, yetkazilmoqda, yetkazildi. Holat o'zgarganda emailingizga ham xabar yuboriladi.",
      },
      {
        question: "Buyurtmani bekor qila olamanmi?",
        answer: "Buyurtma hali “qabul qilinmoqda” holatida bo'lsa, “Buyurtmalarim” sahifasidagi “Bekor qilish” tugmasi orqali o'zingiz bekor qilasiz. Qadoqlash boshlangan bo'lsa, biz bilan bog'laning.",
      },
    ],
  },
  {
    title: "To'lov",
    questions: [
      {
        question: "Qanday to'layman?",
        answer: "To'lov mahsulotni qabul qilganda — naqd pul yoki karta bilan. Saytning o'zida karta ma'lumotlari so'ralmaydi va saqlanmaydi.",
      },
      {
        question: "Oldindan to'lash mumkinmi?",
        answer: "Agar do'kon kartaga o'tkazma usulini yoqqan bo'lsa, “Buyurtmalarim” sahifasida buyurtma ostida karta raqami va summa ko'rinadi: pulni o'tkazib, chek rasmini yuklaysiz. Chek tekshirilgach, buyurtmada “To'langan” belgisi paydo bo'ladi. Bu ixtiyoriy.",
      },
      {
        question: "Narxlar qanday hisoblanadi?",
        answer: "Mahsulot sahifasidagi narx — yakuniy narx: tanlangan xotira varianti va amaldagi chegirma hisobga olingan. Buyurtma berilgan paytdagi narx saqlanadi va keyin o'zgarmaydi.",
      },
    ],
  },
  {
    title: "Yetkazib berish",
    questions: [
      {
        question: "Qanday yetkazib berish usullari bor?",
        answer: "Uchta: standart yetkazib berish, tezkor yetkazib berish va do'kondan olib ketish. Usulni buyurtmani rasmiylashtirishda tanlaysiz.",
      },
      {
        question: "Yetkazib berish qancha turadi va necha kunda keladi?",
        answer: "Muddat va narx manzilingizga bog'liq. Aniq ma'lumot uchun buyurtmadan oldin biz bilan bog'laning yoki buyurtma izohida yozib qoldiring.",
      },
    ],
  },
  {
    title: "Hisob va xavfsizlik",
    questions: [
      {
        question: "Qanday ro'yxatdan o'taman?",
        answer: "“Hisob” sahifasida emailingizni kiriting — unga 6 xonali tasdiqlash kodi yuboriladi. Kodni kiritib, parol o'rnatasiz.",
      },
      {
        question: "Parolni unutdim, nima qilaman?",
        answer: "Kirish sahifasidagi “Parolni unutdingizmi?” havolasi orqali emailingizga kod olasiz va yangi parol o'rnatasiz. Parol o'zgarganda barcha qurilmalardagi sessiyalar yopiladi.",
      },
      {
        question: "Kafolat va qaytarish shartlari qanday?",
        answer: "Kafolat muddati va qaytarish tartibi mahsulot turiga bog'liq. Xariddan oldin aniq shartlarni bilish uchun biz bilan bog'laning.",
      },
    ],
  },
]

export default function FAQPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen bg-background pt-24 pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
            <Link href="/" className="hover:text-foreground transition-colors">Bosh sahifa</Link>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            <span className="text-foreground" aria-current="page">Savol-javoblar</span>
          </nav>

          <div className="text-center mb-12">
            <h1 className="font-serif text-4xl sm:text-5xl">Savol-javoblar</h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Buyurtma, to&apos;lov, yetkazib berish va hisob bo&apos;yicha eng ko&apos;p beriladigan savollar.
            </p>
          </div>

          <div className="space-y-8">
            {faqCategories.map((category) => (
              <section key={category.title} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="bg-secondary/50 px-6 py-4">
                  <h2 className="font-semibold text-lg">{category.title}</h2>
                </div>
                <Accordion type="single" collapsible className="px-6">
                  {category.questions.map((faq) => (
                    <AccordionItem key={faq.question} value={faq.question}>
                      <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed">{faq.answer}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            ))}
          </div>

          <div className="mt-12 rounded-2xl bg-foreground text-background p-8 text-center">
            <MessageCircle className="mx-auto h-8 w-8" aria-hidden="true" />
            <h2 className="mt-4 font-serif text-2xl">Javob topilmadimi?</h2>
            <p className="mt-2 text-background/70">Savolingizni yozib qoldiring — ish vaqtida javob beramiz.</p>
            <Button asChild variant="secondary" className="mt-6 rounded-xl">
              <Link href="/contact">Biz bilan bog&apos;lanish</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
