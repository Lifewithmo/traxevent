import { describe, it, expect } from 'vitest'
import { buildClientRow, buildClientList, cadenceLabel, lastEventLabel } from '@/lib/crm/client-list'
import type { Customer, Lead } from '@/lib/types'

const today = '2026-08-05'

const customer = (over: Partial<Customer>): Customer => ({
  id: 'c', name: 'Dana Kim', created_at: '2026-01-01T00:00:00.000Z', ...over,
})
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l', name: 'Dana Kim', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over,
})

const won = (id: string, event_date: string, value = 1000): Lead =>
  lead({ id, stage: 'closed_won', event_date, estimated_value: value })

describe('buildClientRow', () => {
  it('repeat client with nothing booked lands in dormant_repeat', () => {
    const row = buildClientRow(customer({}), [won('a', '2025-06-10'), won('b', '2025-12-10')], today)
    expect(row.group).toBe('dormant_repeat')
    expect(row.lastEventDate).toBe('2025-12-10')
    expect(row.nextEventDate).toBeUndefined()
    expect(row.monthsSinceLastEvent).toBe(7)
  })

  it('a future won event keeps them in booked_now', () => {
    const row = buildClientRow(customer({}), [won('a', '2025-12-10'), won('b', '2026-09-01')], today)
    expect(row.group).toBe('booked_now')
    expect(row.nextEventDate).toBe('2026-09-01')
  })

  it('an open opportunity keeps them in booked_now even with no wins', () => {
    const row = buildClientRow(customer({}), [lead({ stage: 'proposal', title: 'Gala' })], today)
    expect(row.group).toBe('booked_now')
    expect(row.detail).toContain('Gala')
  })

  it('no history at all is never_booked', () => {
    expect(buildClientRow(customer({}), [], today).group).toBe('never_booked')
  })

  it('cadence appears at three or more won events', () => {
    const two = buildClientRow(customer({}), [won('a', '2025-01-10'), won('b', '2025-04-10')], today)
    expect(two.cadenceMonths).toBeUndefined()
    const three = buildClientRow(
      customer({}),
      [won('a', '2025-01-10'), won('b', '2025-04-10'), won('c', '2025-07-10')],
      today
    )
    expect(three.cadenceMonths).toBe(3)
    expect(cadenceLabel(three)).toBe('quarterly')
    expect(three.detail).toContain('3 events · quarterly')
  })

  it('company-first identity puts the contact name in the detail line', () => {
    const row = buildClientRow(customer({ company: 'Riverside' }), [], today)
    expect(row.detail).toBe('Dana Kim')
  })
})

describe('cadenceLabel wording', () => {
  const withCadence = (m: number) => ({ cadenceMonths: m }) as Parameters<typeof cadenceLabel>[0]
  it('maps common cadences to plain words', () => {
    expect(cadenceLabel(withCadence(1))).toBe('monthly')
    expect(cadenceLabel(withCadence(3))).toBe('quarterly')
    expect(cadenceLabel(withCadence(6))).toBe('twice a year')
    expect(cadenceLabel(withCadence(12))).toBe('yearly')
    expect(cadenceLabel(withCadence(5))).toBe('about every 5 months')
  })
})

describe('lastEventLabel', () => {
  it('speaks in months and years, or an em dash', () => {
    expect(lastEventLabel(buildClientRow(customer({}), [], today))).toBe('—')
    expect(lastEventLabel(buildClientRow(customer({}), [won('a', '2026-08-01')], today))).toBe('This month')
    expect(lastEventLabel(buildClientRow(customer({}), [won('a', '2026-07-01')], today))).toBe('1 month ago')
    expect(lastEventLabel(buildClientRow(customer({}), [won('a', '2025-02-01')], today))).toBe('1y 6mo ago')
  })
})

describe('buildClientList', () => {
  it('orders groups dormant-first and computes the header stats', () => {
    const dormant = customer({ id: 'd', name: 'Dormant' })
    const booked = customer({ id: 'b', name: 'Booked' })
    const fresh = customer({ id: 'f', name: 'Fresh' })
    const data = buildClientList(
      {
        customers: [fresh, booked, dormant],
        leadsByCustomerId: {
          d: [won('d1', '2025-01-10', 2000), won('d2', '2025-06-10', 500)],
          b: [lead({ id: 'b1', stage: 'consultation', estimated_value: 300 })],
        },
      },
      today
    )
    expect(data.blocks.map((b) => b.group)).toEqual(['dormant_repeat', 'booked_now', 'never_booked'])
    expect(data.blocks[0].tone).toBe('urgent')
    expect(data.total).toBe(3)
    expect(data.lifetimeValue).toBe(2500)
    expect(data.worthACall).toBe(1)
    expect(data.repeat).toBe(1)
  })

  it('booked_now / never_booked groups keep longest-quiet-first ordering', () => {
    const older = customer({ id: 'o', name: 'Older' })
    const newer = customer({ id: 'n', name: 'Newer' })
    const data = buildClientList(
      {
        customers: [newer, older],
        leadsByCustomerId: {
          // Both have a FUTURE booking → booked_now, so the quiet-key sort applies.
          o: [won('o1', '2024-01-10'), won('o2', '2026-12-10')],
          n: [won('n1', '2025-01-10'), won('n2', '2026-12-11')],
        },
      },
      today
    )
    const booked = data.blocks.find((b) => b.group === 'booked_now')!
    expect(booked.rows.map((r) => r.customer.id)).toEqual(['o', 'n'])
  })
})

describe('buildClientList — dormant_repeat ranked by re-book beat-urgency', () => {
  it('ranks a quarterly client 2mo overdue above a yearly client 1mo overdue', () => {
    const t = '2026-10-10'
    const quarterly = customer({ id: 'q', name: 'Quarterly' })
    const yearly = customer({ id: 'y', name: 'Yearly' })
    const data = buildClientList(
      {
        // Yearly listed first AND given the larger book of business, so a plain
        // value/quiet sort would rank it first — only beat-urgency puts q ahead.
        customers: [yearly, quarterly],
        leadsByCustomerId: {
          q: [won('q1', '2025-11-10'), won('q2', '2026-02-10'), won('q3', '2026-05-10')],
          y: [won('y1', '2023-09-10', 5000), won('y2', '2024-09-10', 5000), won('y3', '2025-09-10', 5000)],
        },
      },
      t
    )
    const dormant = data.blocks.find((b) => b.group === 'dormant_repeat')!
    expect(dormant.rows.map((r) => r.offBeatMonths)).toEqual([2, 1])
    expect(dormant.rows.map((r) => r.customer.id)).toEqual(['q', 'y'])
  })

  it('breaks a tie at equal urgency by won value, highest first', () => {
    const t = '2026-10-10'
    const lo = customer({ id: 'lo', name: 'Low' })
    const hi = customer({ id: 'hi', name: 'High' })
    const data = buildClientList(
      {
        // Same dates → identical offBeatMonths; only totalWonValue separates them.
        customers: [lo, hi],
        leadsByCustomerId: {
          lo: [won('l1', '2025-11-10', 1000), won('l2', '2026-02-10', 1000), won('l3', '2026-05-10', 1000)],
          hi: [won('h1', '2025-11-10', 3000), won('h2', '2026-02-10', 3000), won('h3', '2026-05-10', 3000)],
        },
      },
      t
    )
    const dormant = data.blocks.find((b) => b.group === 'dormant_repeat')!
    expect(dormant.rows.map((r) => r.offBeatMonths)).toEqual([2, 2])
    expect(dormant.rows.map((r) => r.customer.id)).toEqual(['hi', 'lo'])
  })

  it('holds the beat ranking with an interleaved booked_now client, regardless of input order', () => {
    // Regression for an INTRANSITIVE comparator: the dormant group sorted by
    // beat-urgency while every other pair sorted by quiet-key (lastEventDate).
    // The feature's premise is a MORE off-beat client can have a MORE RECENT
    // last event than a LESS off-beat one — so a booked client whose lastEvent
    // falls between two dormant clients' lastEvents forms a comparison cycle
    // (d1 < b, b < d2 by quiet; d2 < d1 by beat) and scrambles the dormant order.
    const t = '2026-10-10'
    // more_off: 4mo overdue, but MOST RECENT last event (2026-05-10).
    const moreOff = customer({ id: 'more_off', name: 'More Off Beat' })
    // less_off: only 1mo overdue, but OLDEST last event (2025-09-10).
    const lessOff = customer({ id: 'less_off', name: 'Less Off Beat' })
    // booked: lastEvent 2026-01-10 sits BETWEEN the two dormant last events,
    // and a future booking keeps it in booked_now — this is the interleaver.
    const booked = customer({ id: 'booked', name: 'Booked' })
    const leadsByCustomerId: Record<string, Lead[]> = {
      more_off: [won('mo1', '2026-03-10'), won('mo2', '2026-04-10'), won('mo3', '2026-05-10')],
      less_off: [won('lo1', '2023-09-10'), won('lo2', '2024-09-10'), won('lo3', '2025-09-10')],
      booked: [won('bk1', '2026-01-10'), won('bk2', '2027-01-10')],
    }
    // Every permutation of the DB fetch order must yield the same dormant block.
    const permutations: Customer[][] = [
      [moreOff, lessOff, booked],
      [lessOff, moreOff, booked],
      [booked, moreOff, lessOff],
      [booked, lessOff, moreOff],
      [moreOff, booked, lessOff],
      [lessOff, booked, moreOff],
    ]
    for (const customers of permutations) {
      const data = buildClientList({ customers, leadsByCustomerId }, t)
      const dormant = data.blocks.find((b) => b.group === 'dormant_repeat')!
      expect(dormant.rows.map((r) => r.offBeatMonths)).toEqual([4, 1])
      expect(dormant.rows.map((r) => r.customer.id)).toEqual(['more_off', 'less_off'])
    }
  })
})

describe('beatLabel — the queue-pill signal', () => {
  it('reads "Nmo overdue" when past their own beat', () => {
    const row = buildClientRow(
      customer({}),
      [won('a', '2025-11-10'), won('b', '2026-02-10'), won('c', '2026-05-10')],
      '2026-10-10'
    )
    expect(row.offBeatMonths).toBe(2)
    expect(row.beatLabel).toBe('2mo overdue')
  })

  it('reads "due in Nmo" for a dormant client not yet off-beat', () => {
    // Single event → yearly beat; projected 2027-06-10, ten months out.
    const row = buildClientRow(customer({}), [won('a', '2026-06-10')], '2026-08-05')
    expect(row.group).toBe('dormant_repeat')
    expect(row.offBeatMonths).toBeUndefined()
    expect(row.beatLabel).toBe('due in 10mo')
  })

  it('reads "due soon" when the projected re-book is under a month away', () => {
    // Projected 2026-08-20 vs today 2026-08-05 → monthsBetween rounds to 0.
    const row = buildClientRow(customer({}), [won('a', '2025-08-20')], '2026-08-05')
    expect(row.group).toBe('dormant_repeat')
    expect(row.beatLabel).toBe('due soon')
  })

  it('is undefined (rail falls back to time-ago) when projected lands exactly today', () => {
    const row = buildClientRow(customer({}), [won('a', '2025-08-05')], '2026-08-05')
    expect(row.group).toBe('dormant_repeat')
    expect(row.offBeatMonths).toBeUndefined()
    expect(row.beatLabel).toBeUndefined()
  })
})
