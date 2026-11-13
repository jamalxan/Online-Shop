import { BadgeCheck, Eye, Tags, Truck, Undo2, Wallet } from "lucide-react"
import { Reveal } from "@/components/motion/reveal"

// Only things the shop's own system actually does are listed here — no invented numbers or programmes.
const features = [
  {
    icon: BadgeCheck,
    title: "Original mahsulotlar",
    description: "Katalogdagi har bir qurilma original. Savol tug'ilsa, xariddan oldin maslahat beramiz.",
  },
  {
    icon: Wallet,
    title: "To'lov — qabul qilganda",
    description: "Mahsulotni qo'lingizga olganda naqd pul yoki karta bilan to'laysiz. Saytda karta ma'lumoti so'ralmaydi.",
  },
  {
    icon: Truck,
    title: "Uch xil yetkazib berish",
    description: "Standart, tezkor yoki do'kondan olib ketish — buyurtma berishda o'zingiz tanlaysiz.",
  },
  {
    icon: Eye,
    title: "Buyurtmani kuzatish",
    description: "Qabul qilindi, qadoqlanmoqda, yo'lda, yetkazildi — har bir bosqich “Buyurtmalarim” sahifasida ko'rinadi.",
  },
  {
    icon: Undo2,
    title: "Oson bekor qilish",
    description: "Buyurtma hali qayta ishlanmagan bo'lsa, uni bitta tugma bilan bekor qilasiz.",
  },
  {
    icon: Tags,
    title: "Aniq narx",
    description: "Xotira va rang variantlari narxi bilan ko'rsatiladi, chegirma avtomatik hisoblanadi — yashirin to'lov yo'q.",
  },
]

export function WhyChooseUsSection() {
  return (
    <section className="py-20 lg:py-32 bg-secondary/30" aria-labelledby="why-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 id="why-title" className="font-serif text-3xl sm:text-4xl lg:text-5xl text-balance">
            Xarid qilish oson,
            <br />
            <span className="text-muted-foreground">shartlar ochiq</span>
          </h2>
          <p className="mt-4 mx-auto max-w-2xl text-muted-foreground">
            Buyurtma berishdan to qabul qilib olishgacha har bir qadam oldindan ma&apos;lum.
          </p>
        </Reveal>

        {/* The six cards swing in like pages, left to right, row by row. */}
        <Reveal as="ul" kind="turn" className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <li key={feature.title} className="group relative origin-left rounded-2xl bg-background p-8 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary transition-colors group-hover:bg-foreground">
                <feature.icon className="h-6 w-6 transition-colors group-hover:text-background" aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-muted-foreground leading-relaxed">{feature.description}</p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
