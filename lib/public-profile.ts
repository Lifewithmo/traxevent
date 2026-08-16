import type { PublicProfile, PublicProfileLink, PublicProfileSocials } from '@/lib/types'

// Handle: 3–40 chars, lowercase a-z0-9-, starts/ends alphanumeric (spec).
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export function isValidHandle(value: string): boolean {
  return HANDLE_RE.test(value)
}

export const RESERVED_HANDLES = new Set([
  'admin', 'api', 'app', 'www', 'p', 'bio', 'inquire', 'proposals',
  'invoices', 'contracts', 'client', 'brand', 'traxevent', 'brewtrax',
  'orders', 'unsubscribe', 'drops', 'products', 'drop-orders',
])

export function parseHandle(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Handle is required')
  const v = value.trim().toLowerCase()
  if (RESERVED_HANDLES.has(v)) throw new Error('That handle is reserved')
  if (!isValidHandle(v)) {
    throw new Error(
      'Handle must be 3–40 characters — lowercase letters, digits, and hyphens, starting and ending with a letter or digit',
    )
  }
  return v
}

function parseText(value: unknown, field: string, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!v) return undefined
  if (v.length > max) throw new Error(`${field} must be ${max} characters or fewer`)
  return v
}

function parseHttpsUrl(value: unknown, field: string, max: number): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const v = value.trim()
  if (v.length > max) throw new Error(`${field} must be ${max} characters or fewer`)
  let url: URL
  try {
    url = new URL(v)
  } catch {
    throw new Error(`${field} must be an https URL`)
  }
  if (url.protocol !== 'https:') throw new Error(`${field} must be an https URL`)
  return v
}

const SOCIAL_KEYS = ['instagram', 'tiktok', 'youtube', 'facebook', 'website'] as const

const MAX_LINKS = 30

/**
 * Validate untrusted editor input into a storable PublicProfile. Same
 * conventions as parseOrgBranding: throw on malformed, drop empty fields
 * (Firestore rejects undefined), output contains only present keys. The
 * result is public-safe by construction — it ships verbatim to /p/[handle].
 */
export function parsePublicProfile(input: unknown): PublicProfile {
  if (typeof input !== 'object' || input === null) throw new Error('Invalid profile payload')
  const raw = input as Record<string, unknown>

  const out: PublicProfile = {
    enabled: raw.enabled === true,
    handle: parseHandle(raw.handle),
    links: [],
  }

  const displayName = parseText(raw.display_name, 'Display name', 200)
  if (displayName) out.display_name = displayName
  const bio = parseText(raw.bio, 'Bio', 300)
  if (bio) out.bio = bio
  const photo = parseHttpsUrl(raw.photo_url, 'Photo', 500)
  if (photo) out.photo_url = photo

  if (typeof raw.socials === 'object' && raw.socials !== null) {
    const rawSocials = raw.socials as Record<string, unknown>
    const socials: PublicProfileSocials = {}
    for (const key of SOCIAL_KEYS) {
      const url = parseHttpsUrl(rawSocials[key], `${key} URL`, 300)
      if (url) socials[key] = url
    }
    if (Object.keys(socials).length > 0) out.socials = socials
  }

  const rawLinks = Array.isArray(raw.links) ? raw.links : []
  if (rawLinks.length > MAX_LINKS) throw new Error(`At most ${MAX_LINKS} links`)
  for (const [i, rawLink] of rawLinks.entries()) {
    if (typeof rawLink !== 'object' || rawLink === null) throw new Error('Invalid link')
    const l = rawLink as Record<string, unknown>
    const id = typeof l.id === 'string' && l.id.trim() && l.id.trim().length <= 64 ? l.id.trim() : undefined
    const title = parseText(l.title, `Link ${i + 1} title`, 120)
    const url = parseHttpsUrl(l.url, `Link ${i + 1} URL`, 500)
    if (!id || !title || !url) throw new Error(`Link ${i + 1} needs a title and an https URL`)
    const link: PublicProfileLink = { id, title, url }
    const description = parseText(l.description, `Link ${i + 1} description`, 300)
    if (description) link.description = description
    const image = parseHttpsUrl(l.image_url, `Link ${i + 1} image`, 500)
    if (image) link.image_url = image
    out.links.push(link)
  }

  return out
}
