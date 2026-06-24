import type { OrgMember, CampPage } from '@/lib/types'

// Owners/admins have implicit access to every camp page. Staff are limited to the
// pages explicitly granted for that camp in their camp_access map.
export function canAccessCampPage(member: OrgMember, campId: string, page: CampPage): boolean {
  if (member.role === 'owner' || member.role === 'admin') return true
  return member.camp_access?.[campId]?.pages?.includes(page) ?? false
}
