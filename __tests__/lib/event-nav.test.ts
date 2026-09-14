import { describe, it, expect } from 'vitest'
import { buildEventNav } from '@/lib/event-nav'
import { resolveEnabledModules } from '@/lib/industry-packs'
import type { Terminology } from '@/lib/event-types'

const terminology: Terminology = {
  registrantSingular: 'Customer', registrantPlural: 'Customers',
  memberSingular: 'Guest', memberPlural: 'Guests',
  assignmentSingular: 'Assignment', assignmentPlural: 'Assignments',
  eventLabel: 'Event',
}

describe('buildEventNav', () => {
  it('admin market days get Overview · Closeout · Settings — page grants ignored', () => {
    // allowedPages: [] would strip everything on a client job; market days bypass it.
    // The closeout page still carries its own role guard for deep URLs.
    const items = buildEventNav({ kind: 'market_day', terminology, allowedPages: [], isAdmin: true })
    expect(items.map((i) => i.key)).toEqual(['dashboard', 'closeout', 'settings'])
    expect(items.find((i) => i.key === 'closeout')?.label).toBe('Closeout')
  })

  it('non-admin market days drop ONLY the Closeout row — the page would bounce them', () => {
    // Role-gated, not grant-gated: grants stay ignored (allowedPages: [] strips
    // nothing else), and dashboard + settings stay unfiltered.
    for (const items of [
      buildEventNav({ kind: 'market_day', terminology, allowedPages: [] }),
      buildEventNav({ kind: 'market_day', terminology, allowedPages: [], isAdmin: false }),
    ]) {
      expect(items.map((i) => i.key)).toEqual(['dashboard', 'settings'])
    }
  })

  it('client jobs never get the market-day closeout row (theirs lives under ops/)', () => {
    const items = buildEventNav({ kind: 'client_job', terminology })
    expect(items.map((i) => i.key)).not.toContain('closeout')
    expect(items.map((i) => i.key)).toContain('ops')
    // isAdmin gates only the market-day Closeout row — client jobs are untouched.
    expect(buildEventNav({ kind: 'client_job', terminology, isAdmin: true }).map((i) => i.key))
      .toEqual(items.map((i) => i.key))
  })

  it('absent kind means client_job — no market-day nav', () => {
    const items = buildEventNav({ terminology })
    expect(items.map((i) => i.key)).not.toContain('closeout')
  })

  // D3 closeout: Forms + People are family/roster machinery (signed_forms
  // counts, volunteer hours) and must not leak into packs without the
  // attendee-roster module, same as families/assignments/checkin already do.
  it('coffee-cart (no attendee-roster module) hides Forms + People; general (has it) keeps them', () => {
    const coffeeCart = buildEventNav({
      kind: 'client_job',
      terminology,
      enabledModules: resolveEnabledModules('coffee-cart'),
    })
    const general = buildEventNav({
      kind: 'client_job',
      terminology,
      enabledModules: resolveEnabledModules('general'),
    })
    expect(coffeeCart.map((i) => i.key)).not.toContain('forms')
    expect(coffeeCart.map((i) => i.key)).not.toContain('people')
    expect(general.map((i) => i.key)).toContain('forms')
    expect(general.map((i) => i.key)).toContain('people')
  })
})
