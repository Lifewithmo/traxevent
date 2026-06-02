import type { FamilyCsvRow } from '@/lib/types'

export function exportFamiliesCsv(rows: FamilyCsvRow[]): string {
  const HEADER = 'Family Name,Email,Phone,Campers,Status,Balance,Submitted'
  if (rows.length === 0) return HEADER

  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`

  const lines = rows.map(r =>
    [r.familyName, r.email, r.phone, r.campers, r.status, r.balance, r.submitted]
      .map(escape)
      .join(',')
  )

  return [HEADER, ...lines].join('\n')
}
