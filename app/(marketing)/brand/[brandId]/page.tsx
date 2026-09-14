import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getBrand, validBrandParam, signupUrl } from '@/lib/brands'
import { BREWTRAX } from '@/components/marketing/brewtrax-copy'
import { FeeAutopsy } from '@/components/marketing/FeeAutopsy'
import { StorePreview } from '@/components/marketing/StorePreview'
import { ProofWallEmpty } from '@/components/marketing/ProofWallEmpty'
import { ObjectionBand } from '@/components/marketing/ObjectionBand'
import { CtaBand } from '@/components/marketing/CtaBand'

export async function generateMetadata({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const brand = getBrand(brandId)
  return { title: brand.name, description: brand.marketing.subhead }
}

export default async function Home({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  const c = BREWTRAX
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-copper-600">{c.hero.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
            {c.hero.headline[0]}<br /><span className="text-copper-700">{c.hero.headline[1]}</span>
          </h1>
          <p className="mt-4 max-w-prose text-muted-foreground">{c.hero.sub}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={signupUrl(brandId)}><Button size="lg">Start free</Button></a>
            <span className="text-xs text-muted-foreground">{c.ctaMicrocopy}</span>
          </div>
          <Link href="/brand/brewtrax/vs/hotplate" className="mt-4 inline-block text-sm text-[color:var(--link)]">
            {c.hero.dropsEscapeHatch}
          </Link>
        </div>
        <FeeAutopsy heading="What fees are costing you" />
      </section>

      {/* Wedge */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-bold">{c.wedge.title}</h2>
        <p className="mt-2 max-w-prose text-muted-foreground">{c.wedge.body}</p>
      </section>

      {/* Live store preview */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-bold">See your store, fee-free</h2>
        <p className="mt-2 mb-6 max-w-prose text-muted-foreground">
          Type your cart name — this is the page your customers would order from.
        </p>
        <StorePreview />
      </section>

      {/* The OS */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-bold">From "can you do my wedding?" to paid.</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.os.map((s, i) => (
            <div key={s.step} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
              <div className="text-sm font-bold text-copper-600">{i + 1}</div>
              <div className="mt-1 font-semibold">{s.step}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Proof (empty state) */}
      <section className="mx-auto max-w-6xl px-4 py-10"><ProofWallEmpty /></section>

      {/* Objections */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <ObjectionBand items={c.objections} />
      </section>

      {/* Close */}
      <CtaBand brandId={brandId} title={c.close.title} cta={c.close.cta} />
    </main>
  )
}
