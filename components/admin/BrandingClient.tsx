'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateOrgBranding, updateOrgVoiceNote, updateOrgDefaultProposalTerms } from '@/actions/orgs'
import { uploadOrgAsset } from '@/actions/org-assets'
import type { OrgBranding } from '@/lib/types'

interface BrandingClientProps {
  orgId: string
  orgName: string
  initialBranding: OrgBranding
  initialVoiceNote: string
  initialDefaultTerms: string
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

export function BrandingClient({ orgId, orgName, initialBranding, initialVoiceNote, initialDefaultTerms }: BrandingClientProps) {
  const [displayName, setDisplayName] = useState(initialBranding.display_name ?? '')
  const [address, setAddress] = useState(initialBranding.address ?? '')
  const [logoUrl, setLogoUrl] = useState(initialBranding.logo_url ?? '')
  const [coverUrl, setCoverUrl] = useState(initialBranding.cover_image_url ?? '')
  const [accent, setAccent] = useState(initialBranding.accent_color ?? '')
  const [secondary, setSecondary] = useState(initialBranding.secondary_color ?? '')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [defaultTerms, setDefaultTerms] = useState(initialDefaultTerms)
  const [termsBusy, setTermsBusy] = useState(false)
  const [termsError, setTermsError] = useState<string | null>(null)
  const [termsNotice, setTermsNotice] = useState<string | null>(null)

  const [voiceNote, setVoiceNote] = useState(initialVoiceNote)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)

  async function handleSave() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await updateOrgBranding(orgId, {
        display_name: displayName,
        address,
        logo_url: logoUrl,
        cover_image_url: coverUrl,
        accent_color: accent,
        secondary_color: secondary,
      })
      // Re-seed from what actually persisted — the server's normalization
      // (trimming, hex lowercasing, empty-field drops) is the truth.
      setDisplayName(saved.display_name ?? '')
      setAddress(saved.address ?? '')
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

  async function handleSaveVoiceNote() {
    setVoiceBusy(true)
    setVoiceError(null)
    setVoiceNotice(null)
    try {
      await updateOrgVoiceNote(orgId, voiceNote)
      setVoiceNotice('Saved')
    } catch (err: unknown) {
      setVoiceError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setVoiceBusy(false)
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

  async function handleSaveTerms() {
    setTermsBusy(true)
    setTermsError(null)
    setTermsNotice(null)
    try {
      const saved = await updateOrgDefaultProposalTerms(orgId, defaultTerms)
      setDefaultTerms(saved)
      setTermsNotice('Saved')
    } catch (err: unknown) {
      setTermsError(err instanceof Error ? err.message : 'Failed to save terms')
    } finally {
      setTermsBusy(false)
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

          <div className="space-y-1">
            <Label htmlFor="branding-address">Business address</Label>
            <textarea
              id="branding-address"
              value={address}
              placeholder={"123 Main St\nSpringfield, ID 83000"}
              onChange={(e) => setAddress(e.target.value)}
              className="flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p className="text-xs text-gray-500">Shown on your invoices under your business name.</p>
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

      <Card>
        <CardHeader>
          <CardTitle>How we sound</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="branding-voice-note">How we sound</Label>
            <textarea
              id="branding-voice-note"
              value={voiceNote}
              maxLength={1000}
              rows={3}
              onChange={(e) => setVoiceNote(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-500">
              Optional. A sentence or two about your writing style — the AI matches it when drafting proposals.
            </p>
          </div>

          {voiceError && <p className="text-sm text-red-600">{voiceError}</p>}
          {voiceNotice && <p className="text-sm text-green-700">{voiceNotice}</p>}

          <Button onClick={handleSaveVoiceNote} disabled={voiceBusy}>
            {voiceBusy ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proposal terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="branding-default-terms">Proposal terms</Label>
            <textarea
              id="branding-default-terms"
              value={defaultTerms}
              onChange={(e) => setDefaultTerms(e.target.value)}
              placeholder="e.g. A 50% deposit reserves your date. Balance is due 7 days before the event…"
              className="flex min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-gray-500">
              Included on every new proposal. Editable per proposal; changing this never alters existing proposals.
            </p>
          </div>
          {termsError && <p className="text-sm text-red-600">{termsError}</p>}
          {termsNotice && <p className="text-sm text-green-700">{termsNotice}</p>}
          <Button onClick={handleSaveTerms} disabled={termsBusy}>
            {termsBusy ? 'Saving…' : 'Save terms'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
