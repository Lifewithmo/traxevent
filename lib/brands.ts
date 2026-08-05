// lib/brands.ts
// Brand registry: maps acquisition domains to vertically-branded storefronts.
// Parallel in spirit to lib/industry-packs.ts — a static registry with lookups.
// MUST stay dependency-free: imported by proxy.ts (middleware) and client components.

export interface Brand {
  id: string                  // 'brewtrax'
  name: string                // 'BrewTrax'
  domains: string[]           // acquisition domains; default brand leaves this empty
  industryPackId: string      // pre-selected pack for signups through this brand
  theme: { accent: string }   // minimal v1 theming — accent color for the landing page
  marketing: {
    headline: string
    subhead: string
    cta: string
  }
}

export const DEFAULT_BRAND_ID = 'traxevent'

// Main-domain origin for auth flows. Brand domains only serve marketing;
// every CTA sends users here (spec §2: brands own acquisition, app stays home).
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://traxevent.com'

const BUILT_IN_BRANDS: Brand[] = [
  {
    id: DEFAULT_BRAND_ID,
    name: 'TraxEvent',
    domains: [], // traxevent.com is handled by the existing proxy org-subdomain logic
    industryPackId: 'general',
    theme: { accent: '#111827' },
    marketing: {
      headline: 'TraxEvent',
      subhead: 'Registration and management for the events you run.',
      cta: 'Get started',
    },
  },
  {
    id: 'brewtrax',
    name: 'BrewTrax',
    domains: ['brewtrax.com', 'www.brewtrax.com'],
    industryPackId: 'coffee-cart',
    theme: { accent: '#78350f' },
    marketing: {
      headline: 'Run your coffee cart like a pro.',
      subhead:
        'Booking, menus, shopping lists, and event-day checklists for mobile beverage businesses.',
      cta: 'Start free',
    },
  },
]

const BRAND_MAP = new Map<string, Brand>(BUILT_IN_BRANDS.map((b) => [b.id, b]))

export function getBrand(id?: string): Brand {
  return (id ? BRAND_MAP.get(id) : undefined) ?? BRAND_MAP.get(DEFAULT_BRAND_ID)!
}

export function getAllBrands(): Brand[] {
  return [...BUILT_IN_BRANDS]
}

export function getBrandByHostname(hostname: string): Brand | null {
  const host = hostname.split(':')[0]
  for (const brand of BUILT_IN_BRANDS) {
    if (brand.domains.includes(host)) return brand
    // Dev convention: brewtrax.localhost maps to the brewtrax brand.
    if (host === `${brand.id}.localhost`) return brand
  }
  return null
}

/** Validate a ?brand= query value. Only known, non-default brands count. */
export function validBrandParam(value: string | null | undefined): string | null {
  if (!value || value === DEFAULT_BRAND_ID) return null
  return BRAND_MAP.has(value) ? value : null
}

export function signupUrl(brandId: string): string {
  return `${APP_ORIGIN}/signup?brand=${brandId}`
}
