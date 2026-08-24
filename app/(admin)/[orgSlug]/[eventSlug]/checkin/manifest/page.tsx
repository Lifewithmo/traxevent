export const dynamic = 'force-dynamic'

import { requireEventPage } from '@/lib/auth/guards'
import { listAllEventMembers, getCheckinsForDate } from '@/actions/checkins'
import type { CustodyCheckinRecord } from '@/actions/checkins'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { event } = await requireEventPage(orgSlug, eventSlug, 'checkin')
  return { title: `${event.name} — Attendance Manifest` }
}

// The paper custody record: if the tablet dies, this sheet is what the desk
// runs on. It must carry what the screen carries — allergies/medical and the
// emergency contact — not just names and signature lines.
export default async function CheckinManifestPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { date } = await searchParams
  const { orgId, eventId, event } = await requireEventPage(orgSlug, eventSlug, 'checkin')

  const activeDate = date ?? new Date().toISOString().slice(0, 10)

  // Members arrive sorted by family name then member name (server-side).
  const [members, checkins] = await Promise.all([
    listAllEventMembers(orgId, eventId),
    getCheckinsForDate(orgId, eventId, activeDate),
  ])

  const byMember = new Map<string, CustodyCheckinRecord>(checkins.map((c) => [c.member_id, c]))

  function fmtTime(iso?: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="print-root">
      <style>{`
        .print-root * { box-sizing: border-box; }
        /* Paper never inverts: background forced alongside the ink so dark mode
           can't render this custody record black-on-black on screen. */
        .print-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #000; background: #fff; min-height: 100vh; margin: 0; padding: 16px; }
        .print-root h1 { font-size: 18px; margin: 0 0 2px; }
        .print-root .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
        .print-root table { width: 100%; border-collapse: collapse; }
        .print-root th { text-align: left; font-size: 10px; text-transform: uppercase; color: #888; border-bottom: 1px solid #ccc; padding: 6px 4px; }
        .print-root td { padding: 6px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
        .print-root .sig { display: inline-block; width: 90px; border-bottom: 1px solid #999; }
        .print-root .warn { font-weight: 600; }
        .print-root .sub { color: #666; }
        @media print {
          aside { display: none !important; }
          main, [data-event-main] { padding: 0 !important; background: none !important; overflow: visible !important; }
          .print-root { padding: 0; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <h1>{event.name} — Attendance Manifest</h1>
      <p className="meta">{activeDate} · {members.length} registered · printed {new Date().toLocaleDateString()}</p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Family</th>
            <th>Allergies / medical</th>
            <th>Emergency contact</th>
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
                <td>{m.allergy_text ? <span className="warn">{m.allergy_text}</span> : ''}</td>
                <td>
                  {m.emergency_contact_name}
                  {m.emergency_contact_name && m.emergency_contact_phone ? <span className="sub"> · {m.emergency_contact_phone}</span> : m.emergency_contact_phone}
                </td>
                <td>{rec ? (rec.status === 'in' ? 'Checked in' : 'Out') : 'Not arrived'}</td>
                <td>{fmtTime(rec?.first_checked_in_at ?? rec?.checked_in_at)}</td>
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
