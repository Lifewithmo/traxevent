import { describe, it, expect, beforeEach } from 'vitest'
import { mergeSavedMembers } from '@/lib/saved-members'
import type { SavedFamilyMember } from '@/lib/types'

let n = 0
const makeId = () => `id-${++n}`
const incoming = (o: Partial<{ first_name: string; last_name: string; birth_year: number; gender: string }> = {}) =>
  ({ first_name: 'Sam', last_name: 'Lee', birth_year: 2015, gender: 'M', ...o })

describe('mergeSavedMembers', () => {
  beforeEach(() => { n = 0 })

  it('adds new members with generated ids', () => {
    const out = mergeSavedMembers([], [incoming(), incoming({ first_name: 'Jo', birth_year: 2017 })], makeId)
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe('id-1')
  })

  it('dedupes against existing by name+birth_year (case/space-insensitive)', () => {
    const existing: SavedFamilyMember[] = [{ id: 'x', first_name: 'Sam', last_name: 'Lee', birth_year: 2015, gender: 'M' }]
    const out = mergeSavedMembers(existing, [incoming({ first_name: ' sam ', last_name: 'LEE' })], makeId)
    expect(out).toHaveLength(1)
  })

  it('skips incoming with a blank first name', () => {
    const out = mergeSavedMembers([], [incoming({ first_name: '  ' })], makeId)
    expect(out).toHaveLength(0)
  })

  it('dedupes within the incoming batch itself', () => {
    const out = mergeSavedMembers([], [incoming(), incoming()], makeId)
    expect(out).toHaveLength(1)
  })
})
