import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getBrand, signupUrl, DEFAULT_BRAND_ID } from '@/lib/brands'

export default async function BrandLandingPage({
  params,
}: {
  params: Promise<{ brandId: string }>
}) {
  const { brandId } = await params
  const brand = getBrand(brandId)
  // Unknown ids fall back to the default brand; treat both as not-a-brand-page.
  if (brand.id === DEFAULT_BRAND_ID || brand.id !== brandId) notFound()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <span
        className="text-sm font-semibold uppercase tracking-widest mb-3"
        style={{ color: brand.theme.accent }}
      >
        {brand.name}
      </span>
      <h1 className="text-5xl font-bold text-gray-900 mb-4 text-center max-w-2xl">
        {brand.marketing.headline}
      </h1>
      <p className="text-xl text-gray-500 mb-8 text-center max-w-md">
        {brand.marketing.subhead}
      </p>
      <a href={signupUrl(brand.id)}>
        <Button size="lg" style={{ backgroundColor: brand.theme.accent }}>
          {brand.marketing.cta}
        </Button>
      </a>
    </main>
  )
}
