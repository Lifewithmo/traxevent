import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Async server component: await the component to get its element tree, then
// render that (overview-pages precedent). Guards and data actions are mocked
// so none of the firebase-admin graph is pulled in.
vi.mock('@/lib/auth/guards', () => ({
  requireOrgMember: vi.fn(async () => ({
    orgId: 'org1',
    member: { uid: 'u1', role: 'owner' },
  })),
  allowedEventPages: vi.fn(() => ['ops']),
}))
const listEvents = vi.hoisted(() => vi.fn())
// duplicateEvent rides along: DuplicateEventMenu (rendered per ledger row)
// imports it from the same module.
vi.mock('@/actions/events', () => ({ listEvents, duplicateEvent: vi.fn() }))
vi.mock('@/actions/departments', () => ({ listDepartments: vi.fn(async () => []) }))
vi.mock('@/actions/series', () => ({ listSeries: vi.fn(async () => []) }))
vi.mock('@/lib/ops/event-ops', () => ({ getOpsPlanCore: vi.fn(async () => null) }))
// DuplicateEventMenu's dialog calls useRouter at render time.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import OrgHomePage from '@/app/(admin)/[orgSlug]/page'
import type { Event } from '@/lib/types'

let seq = 0
function event(overrides: Partial<Event> = {}): Event {
  seq += 1
  const id = overrides.id ?? `e${seq}`
  return {
    id,
    name: `Event ${id}`,
    slug: `event-${id}`,
    year: 2026,
    status: 'active',
    event_type_id: 'general',
    // Far future: upcoming, but outside the 14-day readiness-horizon window,
    // so the band renders without any plan-doc fan-out entering the picture.
    event_start: '2999-01-01',
    event_end: '2999-01-01',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const params = Promise.resolve({ orgSlug: 'acme' })

describe('Org events home — KPI band', () => {
  it('pins the 4-tile band: Upcoming / Active / Drafts / Guests expected — the census tiles stay retired', async () => {
    // Both kinds present: if the retired 'Client jobs' / 'Market days' census
    // tiles ever came back, this dataset would render them with non-zero counts.
    listEvents.mockResolvedValue([
      event({ id: 'job', name: 'Wedding', headcount: 120 }),
      event({ id: 'mkt', name: 'City Market', kind: 'market_day' }),
      event({ id: 'draft', name: 'Maybe corp', status: 'draft' }),
    ])
    const { container } = render(await OrgHomePage({ params }))

    // KpiBand's grid is a fixed 4-up (2-up below 1000px): exactly four tiles,
    // each a status fact nothing else on the page renders as a count. The
    // 'Client jobs' / 'Market days' census tiles are RETIRED (spec 2026-08-23
    // P1) — they duplicated the header caption verbatim, and re-adding one
    // would either overflow the band or re-fail the no-value-twice gate.
    const tiles = Array.from(container.querySelectorAll('[data-slot="stat-tile"]')).map((t) => t.textContent ?? '')
    expect(tiles).toHaveLength(4)
    for (const label of ['Upcoming', 'Active', 'Drafts', 'Guests expected']) {
      expect(tiles.some((t) => t.includes(label))).toBe(true)
    }
    // The retirement itself: no census tile may reappear. (The header caption
    // legitimately says "N client jobs · N market days" — the assertion is
    // scoped to the band's tiles, not the page text.)
    expect(tiles.some((t) => t.includes('Client job'))).toBe(false)
    expect(tiles.some((t) => t.includes('Market day'))).toBe(false)
    // The freed slots carry real figures from this dataset, not placeholders.
    expect(tiles.some((t) => t.includes('Upcoming') && t.includes('3'))).toBe(true)
    expect(tiles.some((t) => t.includes('Guests expected') && t.includes('120'))).toBe(true)
  })
})
