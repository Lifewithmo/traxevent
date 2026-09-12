import { describe, it, expect } from 'vitest'
import { markCommitted, unscheduledReason, type UnscheduledRow } from '@/lib/calendar-unscheduled'
import type { UnscheduledItem } from '@/lib/calendar'
import type { Lead } from '@/lib/types'

const TODAY = '2026-08-18'

const item = (over: Partial<UnscheduledItem>): UnscheduledItem => ({
  id: 'l1',
  title: 'Nampa block party',
  kind: 'lead',
  href: '/acme/leads/l1',
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
})

const row = (over: Partial<UnscheduledRow>): UnscheduledRow => ({ ...item({}), committed: false, ...over })

const lead = (id: string, stage: Lead['stage']): Pick<Lead, 'id' | 'stage'> => ({ id, stage })

describe('markCommitted', () => {
  it('treats an undated EVENT as committed — conversion is what made it an event', () => {
    const [r] = markCommitted([item({ id: 'e1', kind: 'event', leadId: 'l9' })], [lead('l9', 'proposal')])
    expect(r.committed).toBe(true)
  })

  it('treats a closed_won opportunity as committed even though it arrives as a lead row', () => {
    // This is the row the whole section exists for, and the ONLY signal that
    // separates it from a cold inquiry lives on the lead's stage: buildUnscheduled
    // hands both of them `kind: 'lead'` and `detail: 'no date set'`.
    const rows = markCommitted(
      [item({ id: 'won', leadId: 'won' }), item({ id: 'cold', leadId: 'cold' })],
      [lead('won', 'closed_won'), lead('cold', 'inquiry')]
    )
    expect(rows.map((r) => r.committed)).toEqual([true, false])
  })

  it('leaves every open stage uncommitted', () => {
    const stages: Lead['stage'][] = ['inquiry', 'consultation', 'proposal']
    for (const stage of stages) {
      const [r] = markCommitted([item({ leadId: 'l1' })], [lead('l1', stage)])
      expect(r.committed).toBe(false)
    }
  })

  it('looks the stage up by leadId, not by the row id', () => {
    // The row's OWN id and the opportunity behind it are different keys — an
    // event row carries the event's id. Keying the won-set lookup on the wrong
    // one silently un-sells every committed row that is not a bare lead.
    const [r] = markCommitted(
      [item({ id: 'row-a', leadId: 'won-1' })],
      [lead('won-1', 'closed_won'), lead('row-a', 'inquiry')]
    )
    expect(r.committed).toBe(true)
  })

  it('does not invent a lead link for a row that has none', () => {
    const [r] = markCommitted([item({ id: 'orphan', leadId: undefined })], [lead('orphan', 'closed_won')])
    // Same id, but it is not the row's leadId — matching on id alone would tag
    // an unrelated legacy event as sold.
    expect(r.committed).toBe(false)
  })

  it('preserves every field and the incoming ORDER — ranking belongs to buildUnscheduled', () => {
    const input = [item({ id: 'a', value: 10 }), item({ id: 'b', value: 900 }), item({ id: 'c' })]
    const out = markCommitted(input, [])
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(out[1].value).toBe(900)
  })
})

describe('unscheduledReason', () => {
  it('leads with the book-by deadline and says how long is left', () => {
    const r = unscheduledReason(row({ bookByDate: '2026-08-25' }), TODAY)
    expect(r.text).toBe('Book by Aug 25 · 7d left')
    expect(r.level).toBe('soon')
  })

  it('says PAST DUE in words, not only in colour', () => {
    const r = unscheduledReason(row({ bookByDate: '2026-08-15' }), TODAY)
    expect(r.text).toBe('Book by Aug 15 · 3d past due')
    expect(r.level).toBe('now')
  })

  it('calls the deadline day itself due today', () => {
    expect(unscheduledReason(row({ bookByDate: TODAY }), TODAY)).toEqual({
      level: 'now',
      text: 'Book by Aug 18 · due today',
    })
  })

  it('stays quiet outside the 7-day prep window', () => {
    const r = unscheduledReason(row({ bookByDate: '2026-08-26' }), TODAY)
    expect(r.level).toBe('later')
    expect(r.text).toContain('8d left')
  })

  it('falls back to the money when no date was ever promised', () => {
    expect(unscheduledReason(row({ value: 4500 }), TODAY)).toEqual({
      level: 'later',
      text: '$4,500 · no date promised',
    })
  })

  it('falls back to how long it has waited when there is neither a date nor a value', () => {
    const r = unscheduledReason(row({ createdAt: '2026-08-01T00:00:00.000Z' }), TODAY)
    expect(r.text).toBe('Waiting 17d · no date promised')
    const fresh = unscheduledReason(row({ createdAt: `${TODAY}T09:00:00.000Z` }), TODAY)
    expect(fresh.text).toBe('Added today · no date promised')
  })

  it('never shows a $0 value as the reason — it is not one', () => {
    expect(unscheduledReason(row({ value: 0 }), TODAY).text).toContain('Waiting')
  })

  // ── the point of the tier ──────────────────────────────────────────────────
  it('floors a SOLD row at the top tone however far off its deadline is', () => {
    const far = { bookByDate: '2026-12-01' }
    expect(unscheduledReason(row({ ...far, committed: false }), TODAY).level).toBe('later')
    expect(unscheduledReason(row({ ...far, committed: true }), TODAY).level).toBe('now')
  })

  it('floors a SOLD row with no deadline at all — the promise is already broken', () => {
    expect(unscheduledReason(row({ committed: true, value: 4500 }), TODAY).level).toBe('now')
    expect(unscheduledReason(row({ committed: true }), TODAY).level).toBe('now')
  })

  it('still tells a sold row how long is left — flooring the tone loses no text', () => {
    const r = unscheduledReason(row({ committed: true, bookByDate: '2026-12-01' }), TODAY)
    expect(r.text).toContain('105d left')
  })
})
