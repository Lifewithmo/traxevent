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
  const address = typeof raw.address === 'string' ? raw.address.trim() : ''
  if (address) {
    if (address.length > 500) throw new Error('address must be 500 characters or fewer')
    out.address = address
  }
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

// ---- WCAG contrast guard (spec §2) ------------------------------------------
// Pure math so the theme provider and any future surface share one source of
// truth for "readable". Formulas from WCAG 2.1 (relative luminance, contrast
// ratio).

const NEAR_BLACK = '#111827' // matches the app's gray-900 body-text tone

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => n.toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function relativeLuminance(hex: string): number {
  const linear = (channel: number) => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Text color (white or near-black) with the higher contrast against `bg`. */
export function readableTextOn(bg: string): string {
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, NEAR_BLACK) ? '#ffffff' : NEAR_BLACK
}

const AA_NORMAL_TEXT = 4.5

/**
 * Accent color safe to use as text/links on a white surface: darkened
 * multiplicatively until it clears WCAG AA (4.5:1). Identity for accents
 * that already comply. Always terminates (black is 21:1).
 */
export function accentForTextOnWhite(accent: string): string {
  let [r, g, b] = hexToRgb(accent.toLowerCase())
  let current = rgbToHex(r, g, b)
  while (contrastRatio(current, '#ffffff') < AA_NORMAL_TEXT && (r > 0 || g > 0 || b > 0)) {
    r = Math.floor(r * 0.9)
    g = Math.floor(g * 0.9)
    b = Math.floor(b * 0.9)
    current = rgbToHex(r, g, b)
  }
  return current
}
