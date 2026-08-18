import { notFound } from 'next/navigation'
import { validBrandParam, signupUrl } from '@/lib/brands'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FeeAutopsy } from '@/components/marketing/FeeAutopsy'
import { CtaBand } from '@/components/marketing/CtaBand'

const TIERS = [
  { name: 'Starter', price: '$39', blurb: 'One cart, drops + bookings.', popular: false },
  { name: 'Pro', price: '$79', blurb: 'Everything, plus team seats & advanced ops.', popular: true },
  { name: 'Growth', price: '$149', blurb: 'High-volume drops & multi-cart.', popular: false },
]

export const metadata = { title: 'BrewTrax Pricing', description: 'Flat monthly pricing. 0% per order, always.' }

export default async function Pricing({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">Flat pricing. 0% of your sales.</h1>
        <p className="mt-3 text-muted-foreground">
          Every tier is fee-free on every sale — tiers only change scale and team features,
          never a cut of what you sell. Only Stripe’s processing (2.9% + 30¢) passes through.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <Card
              key={t.name}
              className={`p-6 ${t.popular ? 'ring-2 ring-copper-600' : ''}`}
            >
              {t.popular && (
                <div className="mb-2 inline-block rounded-full bg-copper-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                  Most popular
                </div>
              )}
              <div className="text-lg font-semibold">{t.name}</div>
              <div className="mt-1 text-3xl font-extrabold">
                {t.price}
                <span className="text-base font-normal text-muted-foreground">/mo</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t.blurb}</p>
              <a href={signupUrl(brandId)} className="mt-4 block">
                <Button className="w-full">Start free</Button>
              </a>
            </Card>
          ))}
        </div>
        <div className="mt-12 max-w-md">
          <FeeAutopsy heading="See your savings" />
        </div>
      </section>
      <CtaBand brandId={brandId} title="Keep what you earn." cta="Start free" />
    </main>
  )
}
