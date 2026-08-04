import 'server-only'

import { adminDb } from '@/lib/firebase-admin'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessEventPage } from '@/lib/auth/access'
import type { Event, OrgMember, EventPage } from '@/lib/types'

// Throw-based guards for SERVER ACTIONS (pages use the redirect-based guards in guards.ts).
// assertOrgMember: caller must be a verified member of orgId. Returns the member.
export async function assertOrgMember(orgId: string): Promise<OrgMember> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  if (user.role === 'platform_admin') {
    const snap = await adminDb.collection('orgs').doc(orgId).collection('members').doc(user.uid).get()
    return (snap.exists ? snap.data() : { uid: user.uid, role: 'admin', display_name: '', email: '', event_access: {} }) as OrgMember
  }
  if (user.orgId !== orgId) throw new Error('Forbidden')
  const snap = await adminDb.collection('orgs').doc(orgId).collection('members').doc(user.uid).get()
  if (!snap.exists) throw new Error('Forbidden')
  return snap.data() as OrgMember
}

// Owner/admin only (org-config mutations).
export async function assertOrgAdmin(orgId: string): Promise<OrgMember> {
  const member = await assertOrgMember(orgId)
  if (member.role !== 'owner' && member.role !== 'admin') throw new Error('Forbidden')
  return member
}

// Event-scoped: caller must be an org member AND have access to `page` for `eventId`.
export async function assertEventPage(orgId: string, eventId: string, page: EventPage): Promise<OrgMember> {
  const member = await assertOrgMember(orgId)
  const eventSnap = await adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).get()
  const departmentId = eventSnap.exists ? ((eventSnap.data() as Event).department_id ?? null) : null
  if (!canAccessEventPage(member, eventId, page, departmentId)) throw new Error('Forbidden')
  return member
}
