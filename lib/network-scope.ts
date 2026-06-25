import type { NetworkMember, Org } from '@/lib/types'

// A coordinator is a network member scoped to specific regions; an admin sees everything.
export function isCoordinator(member: NetworkMember): boolean {
  return member.role === 'coordinator'
}

// Restrict an org list to what the calling network member may see.
// Admins (and platform admins, who are passed a synthetic 'admin' member) see all orgs.
// Coordinators see only orgs whose region_id is in their region_ids.
export function scopeOrgsToMember(member: NetworkMember, orgs: Org[]): Org[] {
  if (!isCoordinator(member)) return orgs
  const regions = new Set(member.region_ids ?? [])
  return orgs.filter((o) => o.region_id != null && regions.has(o.region_id))
}
