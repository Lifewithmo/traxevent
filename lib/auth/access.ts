import type { OrgMember, CampPage } from '@/lib/types'

// Owners/admins → every page. Staff → the union of their explicit per-camp grant
// and (when the camp belongs to a department) their department-level grant.
export function canAccessCampPage(
  member: OrgMember,
  campId: string,
  page: CampPage,
  departmentId?: string | null
): boolean {
  if (member.role === 'owner' || member.role === 'admin') return true
  if (member.camp_access?.[campId]?.pages?.includes(page)) return true
  if (departmentId && member.department_access?.[departmentId]?.pages?.includes(page)) return true
  return false
}
