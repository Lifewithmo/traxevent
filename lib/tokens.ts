import { randomBytes } from 'crypto'
import { EVENT_PAGES, type EventPage } from '@/lib/types'

export function buildInviteToken(): string {
  return randomBytes(16).toString('hex')
}

export function validateEventPages(pages: string[]): EventPage[] {
  return pages.filter((p): p is EventPage =>
    (EVENT_PAGES as readonly string[]).includes(p)
  )
}

// Access token utilities (moved from actions/access-tokens.ts)
export function generateAccessToken(): string {
  return randomBytes(24).toString('hex')
}

export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

export function buildFamilyId(): string {
  return randomBytes(8).toString('hex')
}
