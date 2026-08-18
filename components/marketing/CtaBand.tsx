import { signupUrl } from '@/lib/brands'
import { Button } from '@/components/ui/button'

export function CtaBand({ brandId, title, cta }: { brandId: string; title: string; cta: string }) {
  return (
    <section className="bg-copper-600 py-14 text-center text-white">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-white/90">No credit card · live in minutes</p>
      <a href={signupUrl(brandId)} className="mt-5 inline-block">
        <Button size="lg" variant="secondary">{cta}</Button>
      </a>
    </section>
  )
}
