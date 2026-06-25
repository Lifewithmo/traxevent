import { describe, it, expect } from 'vitest'
import { isCoordinator, scopeOrgsToMember } from '@/lib/network-scope'
import type { NetworkMember, Org } from '@/lib/types'

const admin: NetworkMember = { uid: 'a', role: 'admin', display_name: '', email: '' }
const coord: NetworkMember = { uid: 'c', role: 'coordinator', display_name: '', email: '', region_ids: ['r1', 'r2'] }
const org = (id: string, region_id: string | null): Org =>
  ({ id, name: id, slug: id, billing_status: 'active', region_id, created_at: '' }) as Org

const orgs = [org('o1', 'r1'), org('o2', 'r3'), org('o3', null), org('o4', 'r2')]

describe('isCoordinator', () => {
  it('is true only for the coordinator role', () => {
    expect(isCoordinator(coord)).toBe(true)
    expect(isCoordinator(admin)).toBe(false)
  })
})

describe('scopeOrgsToMember', () => {
  it('returns all orgs for an admin', () => {
    expect(scopeOrgsToMember(admin, orgs).map((o) => o.id)).toEqual(['o1', 'o2', 'o3', 'o4'])
  })

  it('returns only orgs in the coordinator’s regions', () => {
    expect(scopeOrgsToMember(coord, orgs).map((o) => o.id)).toEqual(['o1', 'o4'])
  })

  it('returns no orgs for a coordinator with no regions', () => {
    const empty: NetworkMember = { ...coord, region_ids: [] }
    expect(scopeOrgsToMember(empty, orgs)).toEqual([])
  })

  it('treats a missing region_ids as no regions', () => {
    const noRegions: NetworkMember = { uid: 'c', role: 'coordinator', display_name: '', email: '' }
    expect(scopeOrgsToMember(noRegions, orgs)).toEqual([])
  })
})
