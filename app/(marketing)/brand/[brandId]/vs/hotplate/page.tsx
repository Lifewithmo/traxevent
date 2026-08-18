import { notFound } from 'next/navigation'
import { validBrandParam } from '@/lib/brands'
import { ComparisonMatrix } from '@/components/marketing/ComparisonMatrix'
import { FeeAutopsy } from '@/components/marketing/FeeAutopsy'
import { CtaBand } from '@/components/marketing/CtaBand'

export const metadata = {
  title: 'BrewTrax vs Hot Plate',
  description: 'Sell your drops without the per-order fee. See what Hot Plate’s cut is really costing you.',
}

export default async function VsHotplate({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  return (
    <main>
      <section className="mx-auto max-w-4xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">Leaving Hot Plate?</h1>
        <p className="mt-3 max-w-prose text-muted-foreground">
          Same online drops — pre-orders, pickup windows, sell-outs — without the per-order cut taken
          from every order, and with the whole booking-to-paid business alongside it.
        </p>
        <div className="mt-8 grid gap-8 md:grid-cols-2 md:items-start">
          <ComparisonMatrix />
          <FeeAutopsy heading="What Hot Plate is costing you" />
        </div>
      </section>
      <CtaBand brandId={brandId} title="Keep what you earn." cta="Claim your page" />
    </main>
  )
}
