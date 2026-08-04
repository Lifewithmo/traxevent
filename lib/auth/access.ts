import type { OrgMember, EventPage } from '@/lib/types'

// Owners/admins → every page. Staff → the union of their explicit per-event grant
// and (when the event belongs to a department) their department-level grant.
export function canAccessEventPage(
  member: OrgMember,
  eventId: string,
  page: EventPage,
  departmentId?: string | null
): boolean {
  if (member.role === 'owner' || member.role === 'admin') return true
  if (member.event_access?.[eventId]?.pages?.includes(page)) return true
  if (departmentId && member.department_access?.[departmentId]?.pages?.includes(page)) return true
  return false
}
