'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateOrgBranding } from '@/actions/orgs'
import { uploadOrgAsset } from '@/actions/org-assets'
import type { OrgBranding } from '@/lib/types'

interface BrandingClientProps {
  orgId: string
  orgName: string
  initialBranding: OrgBranding
}

const HEX = /^#[0-9a-fA-F]{6}$/

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label} hex</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : '#111827'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-1"
        />
        <Input
          id={id}
          value={value}
          placeholder="#1d4ed8"
          onChange={(e) => onChange(e.target.value)}
          className="w-32 font-mono"
        />
      </div>
    </div>
  )
}

function UploadField({
  id,
  label,
  url,
  busy,
  onFile,
}: {
  id: string
  label: string
  url: string
  busy: boolean
  onFile: (f: File) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {url && (
        // Plain <img>: brand assets are tiny, already public, and next/image
        // would need remotePatterns config for the storage host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`${label} preview`}
          className="max-h-24 rounded border border-gray-200 bg-white object-contain p-1"
        />
      )}
      <Input
        id={id}
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />
    </div>
  )
}

export function BrandingClient({ orgId, orgName, initialBranding }: BrandingClientProps) {
  const [displayName, setDisplayName] = useState(initialBranding.display_name ?? '')
  const [logoUrl, setLogoUrl] = useState(initialBranding.logo_url ?? '')
  const [coverUrl, setCoverUrl] = useState(initialBranding.cover_image_url ?? '')
  const [accent, setAccent] = useState(initialBranding.accent_color ?? '')
  const [secondary, setSecondary] = useState(initialBranding.secondary_color ?? '')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSave() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await updateOrgBranding(orgId, {
        display_name: displayName,
        logo_url: logoUrl,
        cover_image_url: coverUrl,
        accent_color: accent,
        secondary_color: secondary,
      })
      // Re-seed from what actually persisted — the server's normalization
      // (trimming, hex lowercasing, empty-field drops) is the truth.
      setDisplayName(saved.display_name ?? '')
      setLogoUrl(saved.logo_url ?? '')
      setCoverUrl(saved.cover_image_url ?? '')
      setAccent(saved.accent_color ?? '')
      setSecondary(saved.secondary_color ?? '')
      setNotice('Saved')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save branding')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(kind: 'logo' | 'cover', file: File) {
    setUploading(kind)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const { url } = await uploadOrgAsset(orgId, kind, form)
      if (kind === 'logo') setLogoUrl(url)
      else setCoverUrl(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Branding</h1>
        <p className="text-sm text-gray-500">
          Logo, colors, and the name customers see on proposals. Leave a field empty to use the default.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Brand kit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="branding-display-name">Display name</Label>
            <Input
              id="branding-display-name"
              value={displayName}
              placeholder={orgName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="text-xs text-gray-500">Falls back to your org name, {orgName}.</p>
          </div>

          <div className="flex flex-wrap gap-6">
            <ColorField id="branding-accent" label="Accent color" value={accent} onChange={setAccent} />
            <ColorField id="branding-secondary" label="Secondary color" value={secondary} onChange={setSecondary} />
          </div>

          <UploadField
            id="branding-logo"
            label="Logo image"
            url={logoUrl}
            busy={uploading !== null}
            onFile={(f) => handleUpload('logo', f)}
          />
          <UploadField
            id="branding-cover"
            label="Cover image"
            url={coverUrl}
            busy={uploading !== null}
            onFile={(f) => handleUpload('cover', f)}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}

          <Button onClick={handleSave} disabled={busy || uploading !== null}>
            {busy ? 'Saving…' : 'Save branding'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
