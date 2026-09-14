import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { validBrandParam, signupUrl, loginUrl } from '@/lib/brands'
import { BREWTRAX } from '@/components/marketing/brewtrax-copy'

export default async function BrandLayout(
  { children, params }: { children: React.ReactNode; params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params
  if (!validBrandParam(brandId)) notFound()
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/brand/brewtrax" className="font-extrabold text-copper-700">☕ BrewTrax</Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          {BREWTRAX.nav.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-foreground">{n.label}</Link>
          ))}
          <a href={loginUrl()} className="hover:text-foreground">Sign in</a>
          <a href={signupUrl(brandId)}><Button size="sm">Start free</Button></a>
        </nav>
      </header>
      {children}
      <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-muted-foreground">
        ☕ BrewTrax — by TraxEvent · <a href={signupUrl(brandId)} className="text-[color:var(--link)]">{BREWTRAX.close.cta}</a>
      </footer>
    </div>
  )
}
