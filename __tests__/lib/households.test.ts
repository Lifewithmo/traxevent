import { describe, it, expect } from 'vitest'
import { buildHouseholds, type HouseholdRow } from '@/lib/households'

function row(o: Partial<HouseholdRow>): HouseholdRow {
  return {
    email: 'a@x.org', first_name: 'Ann', last_name: 'Lee', phone: '555', registrant_uid: null,
    created_at: '2026-01-01T00:00:00.000Z', camp_id: 'c1', camp_name: 'Summer 2026', year: 2026,
    registration_status: 'confirmed', payment_status: 'paid', ...o,
  }
}

describe('buildHouseholds', () => {
  it('dedupes by normalized email into one household with an events history', () => {
    const hs = buildHouseholds([
      row({ email: 'ann@x.org', camp_id: 'c1', camp_name: 'Summer 2025', year: 2025, created_at: '2025-01-01T00:00:00.000Z' }),
      row({ email: 'ANN@x.org ', camp_id: 'c2', camp_name: 'Summer 2026', year: 2026, created_at: '2026-01-01T00:00:00.000Z', last_name: 'Lee-Smith' }),
    ])
    expect(hs).toHaveLength(1)
    expect(hs[0].email).toBe('ann@x.org')
    expect(hs[0].event_count).toBe(2)
    expect(hs[0].name).toBe('Ann Lee-Smith')
    expect(hs[0].events.map((e) => e.year)).toEqual([2026, 2025])
  })

  it('keeps distinct emails as separate households, sorted by name', () => {
    const hs = buildHouseholds([
      row({ email: 'bo@x.org', first_name: 'Bo', last_name: 'Ng' }),
      row({ email: 'ann@x.org', first_name: 'Ann', last_name: 'Lee' }),
    ])
    expect(hs.map((h) => h.email)).toEqual(['ann@x.org', 'bo@x.org'])
  })

  it('returns [] for no rows', () => {
    expect(buildHouseholds([])).toEqual([])
  })
})
