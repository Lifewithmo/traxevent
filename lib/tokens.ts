import { randomBytes } from 'crypto'
import { CAMP_PAGES, type CampPage } from '@/lib/types'

export function buildInviteToken(): string {
  return randomBytes(16).toString('hex')
}

export function validateCampPages(pages: string[]): CampPage[] {
  return pages.filter((p): p is CampPage =>
    (CAMP_PAGES as readonly string[]).includes(p)
  )
}
