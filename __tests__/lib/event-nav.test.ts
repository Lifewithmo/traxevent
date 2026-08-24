import { describe, it, expect } from 'vitest'
import { buildEventNav } from '@/lib/event-nav'
import type { Terminology } from '@/lib/event-types'

const terminology: Terminology = {
  registrantSingular: 'Customer', registrantPlural: 'Customers',
  memberSingular: 'Guest', memberPlural: 'Guests',
  assignmentSingular: 'Assignment', assignmentPlural: 'Assignments',
  eventLabel: 'Event',
}

describe('buildEventNav', () => {
  it('market days get Overview · Closeout · Settings — page grants ignored', () => {
    // allowedPages: [] would strip everything on a client job; market days bypass it,
    // which is exactly why the closeout page carries its own role guard.
    const items = buildEventNav({ kind: 'market_day', terminology, allowedPages: [] })
    expect(items.map((i) => i.key)).toEqual(['dashboard', 'closeout', 'settings'])
    expect(items.find((i) => i.key === 'closeout')?.label).toBe('Closeout')
  })

  it('client jobs never get the market-day closeout row (theirs lives under ops/)', () => {
    const items = buildEventNav({ kind: 'client_job', terminology })
    expect(items.map((i) => i.key)).not.toContain('closeout')
    expect(items.map((i) => i.key)).toContain('ops')
  })

  it('absent kind means client_job — no market-day nav', () => {
    const items = buildEventNav({ terminology })
    expect(items.map((i) => i.key)).not.toContain('closeout')
  })
})
