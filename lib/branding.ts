import type { OrgBranding } from '@/lib/types'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function parseColor(value: unknown, field: string): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const v = value.trim()
  if (!HEX_COLOR.test(v)) throw new Error(`${field} must be a #rrggbb hex color`)
  return v.toLowerCase()
}

function parseHttpsUrl(value: unknown, field: string): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const v = value.trim()
  let url: URL
  try {
    url = new URL(v)
  } catch {
    throw new Error(`${field} must be an https URL`)
  }
  if (url.protocol !== 'https:') throw new Error(`${field} must be an https URL`)
  return v
}

/**
 * Validate untrusted branding input into a storable OrgBranding.
 * Throws on malformed colors/URLs; empty fields are dropped rather than
 * stored, so the result contains only present keys (Firestore rejects
 * undefined values).
 */
export function parseOrgBranding(input: unknown): OrgBranding {
  if (typeof input !== 'object' || input === null) throw new Error('Invalid branding payload')
  const raw = input as Record<string, unknown>
  const out: OrgBranding = {}
  const name = typeof raw.display_name === 'string' ? raw.display_name.trim() : ''
  if (name) out.display_name = name
  const logo = parseHttpsUrl(raw.logo_url, 'logo_url')
  if (logo) out.logo_url = logo
  const cover = parseHttpsUrl(raw.cover_image_url, 'cover_image_url')
  if (cover) out.cover_image_url = cover
  const accent = parseColor(raw.accent_color, 'accent_color')
  if (accent) out.accent_color = accent
  const secondary = parseColor(raw.secondary_color, 'secondary_color')
  if (secondary) out.secondary_color = secondary
  return out
}
