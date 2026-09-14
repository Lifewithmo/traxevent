import { notFound } from 'next/navigation'
import { validBrandParam } from '@/lib/brands'
import { CtaBand } from '@/components/marketing/CtaBand'

const KINDS = [
  { title: 'Coffee carts', body: 'Weekly drops, private events, and market days — one calendar, one menu.' },
  { title: 'Mobile espresso', body: 'Quote weddings and corporate gigs, then prep with an event-day checklist.' },
  { title: 'Mobile bars', body: 'Proposals, deposits, staffing, and compliance — booked to poured.' },
]

export const metadata = {
  title: 'BrewTrax for mobile beverage',
  description: 'Built for coffee carts, mobile espresso, and mobile bars.',
}

export default async function UseCase({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">Built for the way you actually work.</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {KINDS.map((k) => (
            <div key={k.title} className="rounded-lg bg-card p-5 ring-1 ring-foreground/10">
              <h2 className="font-semibold text-copper-700">{k.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{k.body}</p>
            </div>
          ))}
        </div>
      </section>
      <CtaBand brandId={brandId} title="Keep what you earn." cta="Start free" />
    </main>
  )
}
