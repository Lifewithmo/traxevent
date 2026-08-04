import 'server-only'

import { redirect, notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessEventPage } from '@/lib/auth/access'
import type { Org, Event, OrgMember, EventPage } from '@/lib/types'

// Require a logged-in member of the org identified by orgSlug.
// Redirects to /login if unauthenticated; notFound() if the caller is not a member of THIS org.
export async function requireOrgMember(orgSlug: string): Promise<{ org: Org; orgId: string; member: OrgMember }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const org = orgSnap.docs[0].data() as Org
  const orgId = orgSnap.docs[0].id

  // Platform admins may access any org.
  if (user.role !== 'platform_admin' && user.orgId !== orgId) notFound()

  const memberSnap = await adminDb.collection('orgs').doc(orgId).collection('members').doc(user.uid).get()
  if (!memberSnap.exists && user.role !== 'platform_admin') notFound()
  const member = (memberSnap.exists
    ? (memberSnap.data() as OrgMember)
    : { uid: user.uid, role: 'admin', display_name: '', email: '', event_access: {} }) as OrgMember

  return { org, orgId, member }
}

// Require org membership AND access to a specific event page. Resolves ids and enforces event_access.
// Redirects to the org home if the member lacks access to the page.
export async function requireEventPage(
  orgSlug: string,
  eventSlug: string,
  page: EventPage
): Promise<{ orgId: string; eventId: string; event: Event; member: OrgMember }> {
  const { orgId, member } = await requireOrgMember(orgSlug)

  const eventSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('events').where('slug', '==', eventSlug).limit(1).get()
  if (eventSnap.empty) notFound()
  const event = eventSnap.docs[0].data() as Event
  const eventId = eventSnap.docs[0].id

  if (!canAccessEventPage(member, eventId, page, event.department_id ?? null)) redirect(`/${orgSlug}`)

  return { orgId, eventId, event, member }
}

// Require org membership + resolve the event, WITHOUT a per-page check. Used for the
// event dashboard (every event card links here) and other any-member event entry points.
export async function requireEvent(
  orgSlug: string,
  eventSlug: string
): Promise<{ org: Org; orgId: string; eventId: string; event: Event; member: OrgMember }> {
  const { org, orgId, member } = await requireOrgMember(orgSlug)
  const eventSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('events').where('slug', '==', eventSlug).limit(1).get()
  if (eventSnap.empty) notFound()
  return { org, orgId, eventId: eventSnap.docs[0].id, event: eventSnap.docs[0].data() as Event, member }
}

// List the event pages a member may access (for nav filtering).
export function allowedEventPages(member: OrgMember, eventId: string, allPages: EventPage[], departmentId?: string | null): EventPage[] {
  if (member.role === 'owner' || member.role === 'admin') return allPages
  return allPages.filter((p) => canAccessEventPage(member, eventId, p, departmentId ?? null))
}
