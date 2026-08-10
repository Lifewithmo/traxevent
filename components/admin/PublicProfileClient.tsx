'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { savePublicProfile } from '@/actions/public-profile'
import { uploadOrgAsset } from '@/actions/org-assets'
import type { PublicProfile, PublicProfileSocials } from '@/lib/types'

interface PublicProfileClientProps {
  orgId: string
  orgName: string
  initialProfile: PublicProfile | null
}

// Local editing shape: everything a string so inputs stay controlled;
// parsePublicProfile on the server drops the blanks.
interface EditableLink {
  id: string
  title: string
  description: string
  image_url: string
  url: string
}

const SOCIAL_FIELDS: Array<{ key: keyof PublicProfileSocials; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@…' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@…' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/…' },
  { key: 'website', label: 'Website', placeholder: 'https://…' },
]

function toEditableLinks(profile: PublicProfile | null): EditableLink[] {
  return (profile?.links ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description ?? '',
    image_url: l.image_url ?? '',
    url: l.url,
  }))
}

export function PublicProfileClient({ orgId, orgName, initialProfile }: PublicProfileClientProps) {
  const [enabled, setEnabled] = useState(initialProfile?.enabled ?? false)
  const [handle, setHandle] = useState(initialProfile?.handle ?? '')
  const [displayName, setDisplayName] = useState(initialProfile?.display_name ?? '')
  const [bio, setBio] = useState(initialProfile?.bio ?? '')
  const [photoUrl, setPhotoUrl] = useState(initialProfile?.photo_url ?? '')
  const [socials, setSocials] = useState<Record<string, string>>({
    instagram: initialProfile?.socials?.instagram ?? '',
    tiktok: initialProfile?.socials?.tiktok ?? '',
    youtube: initialProfile?.socials?.youtube ?? '',
    facebook: initialProfile?.socials?.facebook ?? '',
    website: initialProfile?.socials?.website ?? '',
  })
  const [links, setLinks] = useState<EditableLink[]>(toEditableLinks(initialProfile))
  const [savedHandle, setSavedHandle] = useState(initialProfile?.handle ?? '')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null) // 'photo' | link id
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Relative path only during render — reading window.location.origin here
  // would hydration-mismatch (client components SSR too). Event handlers
  // below resolve the absolute URL at click time.
  const livePath = savedHandle ? `/p/${savedHandle}` : null

  async function handleSave() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await savePublicProfile(orgId, {
        enabled,
        handle,
        display_name: displayName,
        bio,
        photo_url: photoUrl,
        socials,
        links,
      })
      // Re-seed from what persisted — server normalization is the truth.
      setEnabled(saved.enabled)
      setHandle(saved.handle)
      setDisplayName(saved.display_name ?? '')
      setBio(saved.bio ?? '')
      setPhotoUrl(saved.photo_url ?? '')
      setSocials({
        instagram: saved.socials?.instagram ?? '',
        tiktok: saved.socials?.tiktok ?? '',
        youtube: saved.socials?.youtube ?? '',
        facebook: saved.socials?.facebook ?? '',
        website: saved.socials?.website ?? '',
      })
      setLinks(toEditableLinks(saved))
      setSavedHandle(saved.handle)
      setNotice('Saved')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(target: 'photo' | string, file: File) {
    setUploading(target)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const kind = target === 'photo' ? 'profile_photo' : 'link_image'
      const { url } = await uploadOrgAsset(orgId, kind, form)
      if (target === 'photo') setPhotoUrl(url)
      else setLinks((ls) => ls.map((l) => (l.id === target ? { ...l, image_url: url } : l)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  function addLink() {
    setLinks((ls) => [
      ...ls,
      { id: crypto.randomUUID(), title: '', description: '', image_url: '', url: '' },
    ])
  }

  function removeLink(id: string) {
    setLinks((ls) => ls.filter((l) => l.id !== id))
  }

  function moveLink(id: string, dir: -1 | 1) {
    setLinks((ls) => {
      const i = ls.findIndex((l) => l.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= ls.length) return ls
      const next = [...ls]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function setLinkField(id: string, field: keyof EditableLink, value: string) {
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

  async function copyLiveUrl() {
    if (!livePath) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${livePath}`)
      setNotice('Link copied')
    } catch {
      setError('Copy failed — select and copy the URL manually')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Public profile</h1>
        <p className="text-sm text-gray-500">
          A public link-in-bio page for your business — put its URL in your Instagram or TikTok bio.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Page is live
          </label>

          <div className="space-y-1">
            <Label htmlFor="profile-handle">Handle</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">/p/</span>
              <Input
                id="profile-handle"
                value={handle}
                placeholder="abbyscoffeecorner"
                onChange={(e) => setHandle(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <p className="text-xs text-gray-500">
              3–40 characters: lowercase letters, digits, and hyphens.
            </p>
          </div>

          {livePath && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <code className="rounded bg-gray-100 px-2 py-1">{livePath}</code>
              <Button type="button" variant="outline" size="sm" onClick={copyLiveUrl}>
                Copy
              </Button>
              {/* This repo's Button has no asChild — plain window.open. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(livePath, '_blank', 'noopener,noreferrer')}
              >
                Open
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="profile-photo">Photo</Label>
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Profile preview"
                className="h-24 w-24 rounded-full border border-gray-200 object-cover"
              />
            )}
            <Input
              id="profile-photo"
              type="file"
              accept="image/*"
              disabled={uploading !== null}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload('photo', f)
              }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="profile-display-name">Display name</Label>
            <Input
              id="profile-display-name"
              value={displayName}
              placeholder={orgName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="text-xs text-gray-500">Falls back to your org name, {orgName}.</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="profile-bio">Bio</Label>
            <textarea
              id="profile-bio"
              value={bio}
              maxLength={300}
              rows={3}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Coffee lover and home barista"
            />
          </div>

          {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`profile-social-${key}`}>{label}</Label>
              <Input
                id={`profile-social-${key}`}
                value={socials[key]}
                placeholder={placeholder}
                onChange={(e) => setSocials((s) => ({ ...s, [key]: e.target.value }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {links.length === 0 && (
            <p className="text-sm text-gray-500">No links yet — add your first button.</p>
          )}
          {links.map((link, i) => (
            <div key={link.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Link {i + 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Move link ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => moveLink(link.id, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Move link ${i + 1} down`}
                    disabled={i === links.length - 1}
                    onClick={() => moveLink(link.id, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Remove link ${i + 1}`}
                    onClick={() => removeLink(link.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <Input
                aria-label={`Link ${i + 1} title`}
                value={link.title}
                placeholder="Title"
                onChange={(e) => setLinkField(link.id, 'title', e.target.value)}
              />
              <Input
                aria-label={`Link ${i + 1} URL`}
                value={link.url}
                placeholder="https://…"
                onChange={(e) => setLinkField(link.id, 'url', e.target.value)}
              />
              <textarea
                aria-label={`Link ${i + 1} description`}
                value={link.description}
                maxLength={300}
                rows={2}
                onChange={(e) => setLinkField(link.id, 'description', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Optional description"
              />
              <div className="flex items-center gap-3">
                {link.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={link.image_url}
                    alt=""
                    className="h-12 w-12 rounded-lg border border-gray-200 object-cover"
                  />
                )}
                <Input
                  aria-label={`Link ${i + 1} thumbnail`}
                  type="file"
                  accept="image/*"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(link.id, f)
                  }}
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addLink} disabled={links.length >= 30}>
            Add link
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <Button onClick={handleSave} disabled={busy || uploading !== null}>
        {busy ? 'Saving…' : 'Save profile'}
      </Button>
    </div>
  )
}
