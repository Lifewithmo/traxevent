import type { ComplianceDoc } from '@/lib/types'

export interface ExpiringDoc {
  id: string
  name: string
  expiresOn: string
  daysLeft: number   // negative when already expired
}

const DAY_MS = 86_400_000

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime()
  const b = new Date(toIso + 'T00:00:00Z').getTime()
  return Math.round((b - a) / DAY_MS)
}

/**
 * Compliance docs that are expired or expiring soon — the one genuinely urgent
 * thing in the catalog section. `now` is an ISO date string (YYYY-MM-DD).
 */
export function findExpiringDocs(docs: ComplianceDoc[], now: string, withinDays = 60): ExpiringDoc[] {
  const today = now.slice(0, 10)
  return docs
    .filter((d): d is ComplianceDoc & { expires_on: string } => typeof d.expires_on === 'string')
    .map((d) => ({
      id: d.id,
      name: d.name,
      expiresOn: d.expires_on.slice(0, 10),
      daysLeft: daysBetween(today, d.expires_on.slice(0, 10)),
    }))
    .filter((d) => d.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}
