import { cache } from 'react'
import type { Metadata } from 'next'
import { adminDb } from '@/lib/firebase-admin'
import { listSlots } from '@/actions/assignments'
import { getAdminFamilies } from '@/actions/admin-families'
import { requireCampPage } from '@/lib/auth/guards'
import { resolveTerminology } from '@/lib/event-types'
import type { FamilyMember } from '@/lib/types'

// Enforce the 'assignments' grant (same as the main assignments page) before
// rendering the roster's PII. cache() dedupes the guard within a single request.
const resolveCtx = cache((orgSlug: string, campSlug: string) =>
  requireCampPage(orgSlug, campSlug, 'assignments')
)

async function getMembersForFamily(
  orgId: string,
  campId: string,
  familyId: string
): Promise<FamilyMember[]> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .collection('family_members')
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FamilyMember)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}): Promise<Metadata> {
  const { orgSlug, campSlug } = await params
  const { camp } = await resolveCtx(orgSlug, campSlug)
  const terminology = resolveTerminology(camp.event_type_id, camp.event_type_terminology)
  return { title: `${camp.name} — ${terminology.assignmentPlural} Roster` }
}

export default async function AssignmentsPrintPage({
  params,
}: {
  params: Promise<{ orgSlug: string; campSlug: string }>
}) {
  const { orgSlug, campSlug } = await params
  const { orgId, campId, camp } = await resolveCtx(orgSlug, campSlug)
  const [slots, families] = await Promise.all([
    listSlots(orgId, campId),
    getAdminFamilies(orgId, campId),
  ])
  const terminology = resolveTerminology(camp.event_type_id, camp.event_type_terminology)
  const registrationUnit = camp.registration_type

  // Group assigned families by slot
  const familiesBySlot = new Map<string, typeof families>()
  slots.forEach((s) => familiesBySlot.set(s.id, []))
  families.forEach((f) => {
    if (f.assignment_slot_id && familiesBySlot.has(f.assignment_slot_id)) {
      familiesBySlot.get(f.assignment_slot_id)!.push(f)
    }
  })

  // For family events, fetch members for each assigned family
  const membersByFamily = new Map<string, FamilyMember[]>()
  if (registrationUnit === 'family') {
    const assigned = families.filter((f) => f.assignment_slot_id)
    await Promise.all(
      assigned.map(async (f) => {
        const members = await getMembersForFamily(orgId, campId, f.id)
        membersByFamily.set(f.id, members)
      })
    )
  }

  const printedAt = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <>
      <style>{`
        .print-root * { box-sizing: border-box; }
        .print-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #000; margin: 0; padding: 16px; }
        .print-root h1 { font-size: 18px; margin: 0 0 4px; }
        .print-root .meta { color: #666; font-size: 11px; margin-bottom: 24px; }
        .print-root .slot { break-inside: avoid; margin-bottom: 24px; border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
        .print-root .slot-header { font-size: 14px; font-weight: bold; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: baseline; }
        .print-root .slot-count { font-weight: normal; color: #666; font-size: 12px; }
        .print-root table { width: 100%; border-collapse: collapse; }
        .print-root th { text-align: left; font-size: 10px; text-transform: uppercase; color: #888; border-bottom: 1px solid #eee; padding: 4px 0; }
        .print-root td { padding: 4px 0; border-bottom: 1px solid #f5f5f5; vertical-align: top; }
        .print-root .members { font-size: 11px; color: #444; }
        .print-root .empty { color: #aaa; font-style: italic; font-size: 11px; }
        @media print {
          aside { display: none !important; }
          main { padding: 0 !important; background: none !important; overflow: visible !important; }
          .print-root { display: block; }
          @page { margin: 1.5cm; }
        }
      `}</style>
      <div className="print-root">
        <h1>{camp.name}</h1>
        <p className="meta">
          {terminology.assignmentPlural} Roster &middot; Printed {printedAt}
        </p>

        {slots.length === 0 && (
          <p className="empty">No {terminology.assignmentPlural.toLowerCase()} defined.</p>
        )}

        {slots.map((slot) => {
          const assigned = familiesBySlot.get(slot.id) ?? []
          return (
            <div key={slot.id} className="slot">
              <div className="slot-header">
                <span>{slot.name}</span>
                <span className="slot-count">
                  {assigned.length}
                  {slot.capacity != null ? `/${slot.capacity}` : ''}{' '}
                  {terminology.registrantPlural.toLowerCase()}
                </span>
              </div>
              {assigned.length === 0 ? (
                <p className="empty">No {terminology.registrantPlural.toLowerCase()} assigned</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>{terminology.registrantSingular}</th>
                      {registrationUnit === 'family' && <th>{terminology.memberPlural}</th>}
                      <th>Email</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assigned.map((f) => {
                      const members = membersByFamily.get(f.id) ?? []
                      return (
                        <tr key={f.id}>
                          <td>{f.first_name} {f.last_name}</td>
                          {registrationUnit === 'family' && (
                            <td className="members">
                              {members.map((m) => `${m.first_name} ${m.last_name}`).join(', ')}
                            </td>
                          )}
                          <td>{f.email}</td>
                          <td>{f.phone}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
