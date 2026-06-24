export const dynamic = 'force-dynamic'

import { requireCampPage } from '@/lib/auth/guards'
import { listAllEventMembers, getCheckinsForDate } from '@/actions/checkins'
import type { CheckinRecord } from '@/lib/types'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { camp } = await requireCampPage(orgSlug, campSlug, 'checkin')
  return { title: `${camp.name} — Attendance Manifest` }
}

export default async function CheckinManifestPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { date } = await searchParams
  const { orgId, campId, camp } = await requireCampPage(orgSlug, campSlug, 'checkin')

  const activeDate = date ?? new Date().toISOString().slice(0, 10)

  const [members, checkins] = await Promise.all([
    listAllEventMembers(orgId, campId),
    getCheckinsForDate(orgId, campId, activeDate),
  ])

  const byMember = new Map<string, CheckinRecord>(checkins.map((c) => [c.member_id, c]))

  function fmtTime(iso?: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="print-root">
      <style>{`
        .print-root * { box-sizing: border-box; }
        .print-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #000; margin: 0; padding: 16px; }
        .print-root h1 { font-size: 18px; margin: 0 0 2px; }
        .print-root .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
        .print-root table { width: 100%; border-collapse: collapse; }
        .print-root th { text-align: left; font-size: 10px; text-transform: uppercase; color: #888; border-bottom: 1px solid #ccc; padding: 6px 4px; }
        .print-root td { padding: 6px 4px; border-bottom: 1px solid #eee; }
        .print-root .sig { display: inline-block; width: 120px; border-bottom: 1px solid #999; }
        @media print {
          aside { display: none !important; }
          main { padding: 0 !important; background: none !important; overflow: visible !important; }
          .print-root { padding: 0; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <h1>{camp.name} — Attendance Manifest</h1>
      <p className="meta">{activeDate} · {members.length} registered · printed {new Date().toLocaleDateString()}</p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Family</th>
            <th>Status</th>
            <th>In</th>
            <th>Out</th>
            <th>Picked up by</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const rec = byMember.get(m.member_id)
            return (
              <tr key={m.member_id}>
                <td>{m.first_name} {m.last_name}</td>
                <td>{m.family_name}</td>
                <td>{rec ? (rec.status === 'in' ? 'Checked in' : 'Out') : 'Not arrived'}</td>
                <td>{fmtTime(rec?.checked_in_at)}</td>
                <td>{fmtTime(rec?.checked_out_at)}</td>
                <td>{rec?.guardian_pickup_name ?? <span className="sig">&nbsp;</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
