import { describe, it, expect } from 'vitest'
import type { CalendarItem } from '@/lib/calendar'
import { attentionCount, needsAttention, weekRollup } from '@/lib/calendar-week'

const TODAY = '2026-08-12'

const item = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'kind' | 'date'>): CalendarItem => ({
  title: 'Untitled',
  href: '/acme/calendar',
  ...over,
})

const ev = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'date'>) =>
  item({ kind: 'event', title: 'Gala', ...over })
const hold = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'date'>) =>
  item({ kind: 'lead', title: 'Wedding', tentative: true, ...over })
const due = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'date'>) =>
  item({ kind: 'invoice_due', title: 'Invoice 1001', amount: 500, ...over })
const todo = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'date'>) =>
  item({ kind: 'task', title: 'Call venue', ...over })
const followUp = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'date'>) =>
  item({ kind: 'follow_up', title: 'Follow up: Dana', ...over })
const compliance = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'date'>) =>
  item({ kind: 'compliance', title: 'Health permit expires', ...over })
const pickup = (over: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'date'>) =>
  item({ kind: 'drop', title: 'Drop pickup: Weekend', ...over })

describe('weekRollup', () => {
  it('reports all six figures over a mixed week', () => {
    const rollup = weekRollup(
      [
        ev({ id: 'e1', date: '2026-08-10', headcount: 80 }),
        ev({ id: 'e2', date: '2026-08-15T18:00:00.000Z', headcount: 45 }),
        hold({ id: 'l1', date: '2026-08-14' }),
        due({ id: 'i1', date: '2026-08-11', amount: 900 }),
        due({ id: 'i2', date: '2026-08-16', amount: 250 }),
        compliance({ id: 'c1', date: '2026-08-13', blocker: true }),
        pickup({ id: 'd1', date: '2026-08-15' }),
      ],
      TODAY
    )
    expect(rollup).toEqual({
      eventCount: 2,
      guestCount: 125,
      tentativeCount: 1,
      dueAmount: 1150,
      overdueDueAmount: 900,
      blockerCount: 1,
    })
  })

  it('counts events without a headcount but adds no guests', () => {
    const rollup = weekRollup([ev({ id: 'e1', date: '2026-08-13' }), ev({ id: 'e2', date: '2026-08-14', headcount: 30 })], TODAY)
    expect(rollup.eventCount).toBe(2)
    expect(rollup.guestCount).toBe(30)
  })

  it('overdueDueAmount is the past-due subset of dueAmount, comparing the date part only', () => {
    const rollup = weekRollup(
      [
        due({ id: 'past', date: '2026-08-11T23:59:00.000Z', amount: 400 }),
        due({ id: 'today', date: '2026-08-12T00:00:00.000Z', amount: 100 }),
        due({ id: 'future', date: '2026-08-14', amount: 60 }),
        due({ id: 'no-amount', date: '2026-08-10' , amount: undefined }),
      ],
      TODAY
    )
    expect(rollup.dueAmount).toBe(560)
    // an invoice due later today is not yet overdue
    expect(rollup.overdueDueAmount).toBe(400)
  })

  it('returns all zeros for an empty week', () => {
    expect(weekRollup([], TODAY)).toEqual({
      eventCount: 0, guestCount: 0, tentativeCount: 0, dueAmount: 0, overdueDueAmount: 0, blockerCount: 0,
    })
  })
})

describe('needsAttention', () => {
  it('picks up a blocking compliance doc', () => {
    const groups = needsAttention([compliance({ id: 'c1', date: '2026-08-20', blocker: true })], TODAY)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ key: 'blocker', label: 'Blocking a booked event' })
    expect(groups[0].entries[0]).toMatchObject({ reason: 'blocker', overdue: false })
    expect(groups[0].entries[0].item.id).toBe('c1')
  })

  it('picks up past-due tasks and follow-ups', () => {
    const groups = needsAttention(
      [todo({ id: 't1', date: '2026-08-09' }), followUp({ id: 'f1', date: '2026-08-11' })],
      TODAY
    )
    expect(groups.map((g) => g.key)).toEqual(['overdue'])
    expect(groups[0].label).toBe('Past due')
    expect(groups[0].entries.map((e) => e.item.id)).toEqual(['t1', 'f1'])
    expect(groups[0].entries.every((e) => e.overdue)).toBe(true)
  })

  it('picks up invoices due, overdue or not', () => {
    const groups = needsAttention([due({ id: 'i1', date: '2026-08-05' }), due({ id: 'i2', date: '2026-08-20' })], TODAY)
    expect(groups.map((g) => g.key)).toEqual(['money'])
    expect(groups[0].label).toBe('Money owed')
    expect(groups[0].entries.map((e) => e.overdue)).toEqual([true, false])
  })

  it('picks up tentative holds', () => {
    const groups = needsAttention([hold({ id: 'l1', date: '2026-08-18' })], TODAY)
    expect(groups.map((g) => g.key)).toEqual(['unbooked'])
    expect(groups[0].label).toBe('Not booked yet')
  })

  it('first match wins: a past-due blocking doc is a blocker, not overdue', () => {
    const groups = needsAttention([compliance({ id: 'c1', date: '2026-08-01', blocker: true })], TODAY)
    expect(groups.map((g) => g.key)).toEqual(['blocker'])
    expect(groups[0].entries[0]).toMatchObject({ reason: 'blocker', overdue: true })
  })

  it('first match wins: a blocking past-due task is a blocker, not overdue', () => {
    const groups = needsAttention([todo({ id: 't1', date: '2026-08-01', blocker: true })], TODAY)
    expect(groups.map((g) => g.key)).toEqual(['blocker'])
  })

  it('first match wins: a tentative invoice is money, not unbooked', () => {
    const groups = needsAttention([due({ id: 'i1', date: '2026-08-14', tentative: true })], TODAY)
    expect(groups.map((g) => g.key)).toEqual(['money'])
    expect(groups[0].entries[0].reason).toBe('money')
  })

  it('excludes booked events, non-blocking compliance, drops, and future-dated tasks', () => {
    const groups = needsAttention(
      [
        ev({ id: 'e1', date: '2026-08-14', headcount: 40 }),
        ev({ id: 'e2', date: '2026-08-01' }), // a past booked event is still not a decision
        compliance({ id: 'c1', date: '2026-08-15' }),
        compliance({ id: 'c2', date: '2026-08-15', blocker: false }),
        pickup({ id: 'd1', date: '2026-08-13' }),
        todo({ id: 't1', date: '2026-08-20' }),
        followUp({ id: 'f1', date: TODAY }), // due today is not yet past due
      ],
      TODAY
    )
    expect(groups).toEqual([])
    expect(attentionCount(groups)).toBe(0)
  })

  it('keeps past-due items outside the horizon but drops future ones beyond it', () => {
    const groups = needsAttention(
      [
        due({ id: 'ancient', date: '2025-01-05' }),
        todo({ id: 't-old', date: '2026-01-05' }),
        due({ id: 'edge', date: '2026-09-11' }), // today + 30
        due({ id: 'beyond', date: '2026-09-12' }), // today + 31
      ],
      TODAY
    )
    const ids = groups.flatMap((g) => g.entries.map((e) => e.item.id))
    expect(ids).toEqual(['t-old', 'ancient', 'edge'])
    expect(ids).not.toContain('beyond')
  })

  it('honours a custom horizon', () => {
    const items = [due({ id: 'in', date: '2026-08-18' }), due({ id: 'out', date: '2026-08-20' })]
    const ids = needsAttention(items, TODAY, 7).flatMap((g) => g.entries.map((e) => e.item.id))
    expect(ids).toEqual(['in'])
  })

  it('orders groups blocker → overdue → money → unbooked and omits empty ones', () => {
    const all = needsAttention(
      [
        hold({ id: 'l1', date: '2026-08-18' }),
        due({ id: 'i1', date: '2026-08-14' }),
        todo({ id: 't1', date: '2026-08-05' }),
        compliance({ id: 'c1', date: '2026-08-16', blocker: true }),
      ],
      TODAY
    )
    expect(all.map((g) => g.key)).toEqual(['blocker', 'overdue', 'money', 'unbooked'])

    const some = needsAttention([hold({ id: 'l1', date: '2026-08-18' }), due({ id: 'i1', date: '2026-08-14' })], TODAY)
    expect(some.map((g) => g.key)).toEqual(['money', 'unbooked'])
  })

  it('sorts within a group earliest-first, tie-breaking by id', () => {
    const groups = needsAttention(
      [
        due({ id: 'b', date: '2026-08-14' }),
        due({ id: 'z', date: '2026-08-02' }),
        due({ id: 'a', date: '2026-08-14' }),
        due({ id: 'c', date: '2026-08-02T09:00:00.000Z' }),
      ],
      TODAY
    )
    expect(groups[0].entries.map((e) => e.item.id)).toEqual(['c', 'z', 'a', 'b'])
  })

  it('never mutates or reorders the caller’s array', () => {
    const items = [
      due({ id: 'b', date: '2026-08-14' }),
      due({ id: 'a', date: '2026-08-02' }),
      ev({ id: 'e1', date: '2026-08-13' }),
    ]
    const before = items.map((i) => i.id)
    const snapshot = JSON.parse(JSON.stringify(items))
    needsAttention(items, TODAY)
    expect(items.map((i) => i.id)).toEqual(before)
    expect(items).toEqual(snapshot)
  })

  it('accepts a full ISO timestamp as today', () => {
    const groups = needsAttention([todo({ id: 't1', date: '2026-08-11' })], '2026-08-12T14:30:00.000Z')
    expect(groups.map((g) => g.key)).toEqual(['overdue'])
  })
})

describe('attentionCount', () => {
  it('sums entries across every group', () => {
    const groups = needsAttention(
      [
        compliance({ id: 'c1', date: '2026-08-16', blocker: true }),
        todo({ id: 't1', date: '2026-08-05' }),
        followUp({ id: 'f1', date: '2026-08-06' }),
        due({ id: 'i1', date: '2026-08-14' }),
        hold({ id: 'l1', date: '2026-08-18' }),
        ev({ id: 'e1', date: '2026-08-13' }), // excluded
      ],
      TODAY
    )
    expect(groups.map((g) => g.entries.length)).toEqual([1, 2, 1, 1])
    expect(attentionCount(groups)).toBe(5)
  })

  it('is zero for no groups', () => {
    expect(attentionCount([])).toBe(0)
  })
})
