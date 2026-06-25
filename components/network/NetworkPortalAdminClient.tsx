'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  updateNetworkBranding,
  setNetworkPortalDomain,
  removeNetworkPortalDomain,
} from '@/actions/network-portal'
import type { Network } from '@/lib/types'

interface NetworkPortalAdminClientProps {
  network: Network
}

export function NetworkPortalAdminClient({ network }: NetworkPortalAdminClientProps) {
  const router = useRouter()

  // Branding state
  const [displayName, setDisplayName] = useState(network.display_name ?? '')
  const [logoUrl, setLogoUrl] = useState(network.logo_url ?? '')
  const [primaryColor, setPrimaryColor] = useState(network.primary_color ?? '#2563EB')
  const [accentColor, setAccentColor] = useState(network.accent_color ?? '#059669')

  // Domain state
  const [portalDomain, setPortalDomain] = useState<string | null>(network.portal_domain ?? null)
  const [domainInput, setDomainInput] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const portalPath = `/portal/${network.slug}`

  async function handleSaveBranding() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await updateNetworkBranding(network.id, {
        display_name: displayName,
        logo_url: logoUrl,
        primary_color: primaryColor,
        accent_color: accentColor,
      })
      setNotice('Branding saved.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save branding')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveDomain() {
    if (!domainInput.trim()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const normalized = domainInput.trim().toLowerCase()
      await setNetworkPortalDomain(network.id, normalized)
      setPortalDomain(normalized)
      setDomainInput('')
      setNotice('Domain saved. Add the CNAME record below, then ask us to attach it.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save domain')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveDomain() {
    if (!confirm('Remove this custom domain? Your portal will revert to the default path.')) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await removeNetworkPortalDomain(network.id)
      setPortalDomain(null)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove domain')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Portal &amp; Branding</h1>
      <p className="text-sm text-muted-foreground">
        Customize your network&rsquo;s public portal — its name, logo, colors, and (optionally) your
        own custom domain. The portal lists upcoming events across your member organizations.
      </p>

      <div aria-live="polite" aria-atomic="true" className="space-y-1">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={network.name}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.org/logo.png"
            />
            <p className="text-xs text-muted-foreground">Must start with http:// or https://</p>
          </div>

          <div className="flex gap-6">
            <div className="space-y-1">
              <Label htmlFor="primaryColor">Primary color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="primaryColor"
                  value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : '#2563EB'}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 rounded border border-input bg-background p-1"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#2563EB"
                  className="w-28 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="accentColor">Accent color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="accentColor"
                  value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#059669'}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 rounded border border-input bg-background p-1"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#059669"
                  className="w-28 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <div className="flex items-center gap-3 rounded-md border p-3">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={displayName || network.name} className="h-8 w-8 rounded object-contain" />
              )}
              <span className="font-semibold" style={{ color: primaryColor }}>
                {displayName || network.name}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <span className="inline-block h-6 w-6 rounded border" style={{ backgroundColor: primaryColor }} />
                <span className="inline-block h-6 w-6 rounded border" style={{ backgroundColor: accentColor }} />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={handleSaveBranding} disabled={busy}>
              {busy ? 'Saving…' : 'Save branding'}
            </Button>
            <a
              href={portalPath}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              View your portal →
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-3">
            Custom domain
            {portalDomain && <Badge variant="secondary" className="font-mono">{portalDomain}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {portalDomain ? (
            <div className="flex items-center gap-3">
              <span className="text-sm">
                Current domain: <span className="font-mono">{portalDomain}</span>
              </span>
              <Button variant="outline" onClick={handleRemoveDomain} disabled={busy}>
                Remove
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No custom domain set.</p>
          )}

          <div className="space-y-1">
            <Label htmlFor="portalDomain">{portalDomain ? 'Change domain' : 'Add a domain'}</Label>
            <div className="flex gap-2">
              <Input
                id="portalDomain"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="camps.yourdomain.org"
              />
              <Button onClick={handleSaveDomain} disabled={busy || !domainInput.trim()}>
                {busy ? 'Saving…' : 'Save domain'}
              </Button>
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p>
              Point a CNAME record for this domain to{' '}
              <span className="font-mono">cname.vercel-dns.com</span>, then ask your TraxEvent
              contact to attach it.
            </p>
            <p>
              Until attached, your portal is available at{' '}
              <span className="font-mono">{portalPath}</span>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
