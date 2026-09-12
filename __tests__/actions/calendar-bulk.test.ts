import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// A tiny in-memory Firestore that records WHICH document each write hit and
// WHICH transaction it belonged to. That grouping is the whole point: the
// both-fields guarantee is only worth anything if the two writes are atomic.
// ─────────────────────────────────────────────────────────────────────────────
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<{ path: string; payload: Record<string, unknown>; tx: number }>,
  txCount: 0,
  /** transactions that issued a read after a write (illegal in Firestore). */
  orderViolations: 0,
}))

vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string) => ({ path })
  return {
    adminDb: {
      collection: (c: string) => ({
        doc: (id: string) => ({
          collection: (sub: string) => ({ doc: (subId: string) => ref(`${c}/${id}/${sub}/${subId}`) }),
        }),
      }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        store.txCount += 1
        const tx = store.txCount
        let wrote = false
        const out = await fn({
          get: async (r: { path: string }) => {
            if (wrote) store.orderViolations += 1
            const data = store.docs.get(r.path)
            return { exists: data !== undefined, data: () => data }
          },
          update: (r: { path: string }, payload: Record<string, unknown>) => {
            wrote = true
            store.updates.push({ path: r.path, payload, tx })
            const cur = store.docs.get(r.path)
            if (cur) store.docs.set(r.path, { ...cur, ...payload })
          },
        })
        return out
      },
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ uid: 'u1', role: 'admin', event_access: {} }),
}))
vi.mock('@/lib/calendar-fetch', () => ({ orgIdBySlug: vi.fn().mockResolvedValue('org-1') }))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }))
// Confirm-ready clearing path (c) collaborators — mocked exactly like the
// updateEvent hook suite (events.test.ts): the contract under test is WHEN the
// move calls them, not what they write.
vi.mock('@/lib/ops/event-ops', () => ({
  getOpsPlanCore: vi.fn().mockResolvedValue(null),
  clearReadyConfirmedCore: vi.fn().mockResolvedValue(undefined),
}))

import { assertOrgAdmin } from '@/lib/auth/assert'
import { orgIdBySlug } from '@/lib/calendar-fetch'
import { logActivity } from '@/lib/activity'
import { getOpsPlanCore, clearReadyConfirmedCore } from '@/lib/ops/event-ops'
import { bulkRescheduleAgenda, rescheduleCalendarItem } from '@/actions/calendar-bulk'

const EVENT = 'orgs/org-1/events/e1'
const LEAD = 'orgs/org-1/leads/l1'

const updatesFor = (path: string) => store.updates.filter((u) => u.path === path)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(orgIdBySlug).mockResolvedValue('org-1')
  vi.mocked(assertOrgAdmin).mockResolvedValue({ uid: 'u1', role: 'admin', event_access: {} } as never)
  vi.mocked(getOpsPlanCore).mockResolvedValue(null)
  vi.mocked(clearReadyConfirmedCore).mockResolvedValue(undefined)
  store.docs.clear()
  store.updates.length = 0
  store.txCount = 0
  store.orderViolations = 0
  store.docs.set(EVENT, { id: 'e1', name: 'Smith Wedding', lead_id: 'l1', event_start: '2026-08-19', event_end: '2026-08-19' })
  store.docs.set(LEAD, { id: 'l1', name: 'Smith', stage: 'closed_won', event_date: '2026-08-19' })
})

describe('bulkRescheduleAgenda — the both-fields guarantee', () => {
  it('writes Event.event_start/_end AND Lead.event_date', async () => {
    const res = await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])

    expect(res).toEqual({ moved: 1, failures: [] })
    expect(updatesFor(EVENT)[0].payload).toMatchObject({ event_start: '2026-09-05', event_end: '2026-09-05' })
    // The cascade the double-booking radar (computeCapacity) depends on — it
    // filters on `lead.event_date === date`, so an event-only write leaves the
    // radar pointed at the day the job USED to be on.
    expect(updatesFor(LEAD)[0].payload).toMatchObject({ event_date: '2026-09-05' })
  })

  it('writes both fields inside ONE transaction', async () => {
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(store.txCount).toBe(1)
    expect(updatesFor(EVENT)[0].tx).toBe(updatesFor(LEAD)[0].tx)
  })

  it('reads every document before it writes any (Firestore transaction rule)', async () => {
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(store.orderViolations).toBe(0)
  })

  it('leaves the lead alone when the job has no opportunity behind it', async () => {
    store.docs.set(EVENT, { id: 'e1', name: 'Market day', event_start: '2026-08-19', event_end: '2026-08-19' })
    const res = await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(res.moved).toBe(1)
    expect(updatesFor(EVENT)).toHaveLength(1)
    expect(updatesFor(LEAD)).toHaveLength(0)
  })

  it('survives a dangling lead_id without failing the job move', async () => {
    store.docs.delete(LEAD)
    const res = await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(res).toEqual({ moved: 1, failures: [] })
    expect(updatesFor(EVENT)).toHaveLength(1)
    expect(updatesFor(LEAD)).toHaveLength(0)
  })
})

describe('bulkRescheduleAgenda — date arithmetic', () => {
  it('preserves a multi-day span', async () => {
    store.docs.set(EVENT, { id: 'e1', lead_id: 'l1', event_start: '2026-08-19', event_end: '2026-08-21' })
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(updatesFor(EVENT)[0].payload).toMatchObject({ event_start: '2026-09-05', event_end: '2026-09-07' })
  })

  it('preserves the stored time-of-day suffix on both ends', async () => {
    store.docs.set(EVENT, {
      id: 'e1', lead_id: 'l1',
      event_start: '2026-08-19T14:00:00.000Z',
      event_end: '2026-08-19T20:30:00.000Z',
    })
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(updatesFor(EVENT)[0].payload).toMatchObject({
      event_start: '2026-09-05T14:00:00.000Z',
      event_end: '2026-09-05T20:30:00.000Z',
    })
  })

  it('writes the bare ymd the capacity radar matches on', async () => {
    store.docs.set(EVENT, { id: 'e1', lead_id: 'l1', event_start: '2026-08-19T14:00:00.000Z', event_end: '2026-08-19T20:00:00.000Z' })
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    // computeCapacity does `l.event_date === date` on a YYYY-MM-DD — a timestamp here silences the radar.
    expect(updatesFor(LEAD)[0].payload.event_date).toBe('2026-09-05')
  })
})

describe('bulkRescheduleAgenda — holds', () => {
  it('moves a tentative hold by writing Lead.event_date', async () => {
    const res = await bulkRescheduleAgenda('acme', [{ kind: 'lead', id: 'l1', date: '2026-10-01' }])
    expect(res.moved).toBe(1)
    expect(updatesFor(LEAD)[0].payload).toMatchObject({ event_date: '2026-10-01' })
    expect(updatesFor(EVENT)).toHaveLength(0)
  })
})

describe('bulkRescheduleAgenda — guards', () => {
  it('resolves the slug and asserts org admin before writing', async () => {
    await bulkRescheduleAgenda('acme', [{ kind: 'lead', id: 'l1', date: '2026-10-01' }])
    expect(orgIdBySlug).toHaveBeenCalledWith('acme')
    expect(assertOrgAdmin).toHaveBeenCalledWith('org-1')
  })

  it('refuses an unknown org', async () => {
    vi.mocked(orgIdBySlug).mockResolvedValue(null)
    await expect(bulkRescheduleAgenda('nope', [{ kind: 'lead', id: 'l1', date: '2026-10-01' }])).rejects.toThrow('Org not found')
    expect(store.updates).toHaveLength(0)
  })

  it('refuses a kind whose date it does not own', async () => {
    await expect(
      // an invoice due date belongs to the invoice's terms, not to a reschedule
      bulkRescheduleAgenda('acme', [{ kind: 'invoice_due' as never, id: 'i1', date: '2026-10-01' }])
    ).rejects.toThrow('cannot be rescheduled')
    expect(store.updates).toHaveLength(0)
  })

  it('refuses a malformed or empty date', async () => {
    await expect(bulkRescheduleAgenda('acme', [{ kind: 'lead', id: 'l1', date: 'tomorrow' }])).rejects.toThrow('valid date')
    await expect(bulkRescheduleAgenda('acme', [{ kind: 'lead', id: 'l1', date: '' }])).rejects.toThrow('valid date')
    expect(store.updates).toHaveLength(0)
  })

  it('refuses an empty batch and an oversized one', async () => {
    await expect(bulkRescheduleAgenda('acme', [])).rejects.toThrow('Nothing to reschedule')
    const huge = Array.from({ length: 201 }, (_, n) => ({ kind: 'lead' as const, id: `l${n}`, date: '2026-10-01' }))
    await expect(bulkRescheduleAgenda('acme', huge)).rejects.toThrow('200 or fewer')
    expect(store.updates).toHaveLength(0)
  })
})

describe('bulkRescheduleAgenda — partial failure', () => {
  it('reports the row that could not move and still applies the rest', async () => {
    const res = await bulkRescheduleAgenda('acme', [
      { kind: 'event', id: 'ghost', date: '2026-09-05' },
      { kind: 'lead', id: 'l1', date: '2026-09-05' },
    ])
    expect(res.moved).toBe(1)
    expect(res.failures).toEqual([{ kind: 'event', id: 'ghost', message: 'Job not found' }])
    expect(updatesFor(LEAD)[0].payload).toMatchObject({ event_date: '2026-09-05' })
  })

  it('reports a missing opportunity', async () => {
    store.docs.delete(LEAD)
    const res = await bulkRescheduleAgenda('acme', [{ kind: 'lead', id: 'l1', date: '2026-09-05' }])
    expect(res.moved).toBe(0)
    expect(res.failures[0].message).toBe('Opportunity not found')
  })
})

describe('bulkRescheduleAgenda — activity', () => {
  it('logs one entry per cascaded opportunity', async () => {
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(logActivity).toHaveBeenCalledWith('org-1', expect.objectContaining({
      parent_type: 'opportunity', parent_id: 'l1', summary: 'Rescheduled to 2026-09-05',
    }))
  })

  it('logs nothing for a job with no opportunity', async () => {
    store.docs.set(EVENT, { id: 'e1', event_start: '2026-08-19', event_end: '2026-08-19' })
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(logActivity).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// W3-J — the single-item entry point the calendar GRID drags through.
//
// It exists so the grid does not have to fake a batch, and it is deliberately a
// thin wrapper: the both-fields transaction is written ONCE, so these tests are
// really asserting that the drag path cannot drift away from the bulk path.
// ─────────────────────────────────────────────────────────────────────────────
describe('rescheduleCalendarItem — the drag path inherits the both-fields guarantee', () => {
  it('writes Event.event_start/_end AND Lead.event_date, in ONE transaction', async () => {
    const res = await rescheduleCalendarItem('acme', { kind: 'event', id: 'e1', date: '2026-09-05' })

    expect(res).toEqual({ moved: 1, failures: [] })
    expect(updatesFor(EVENT)[0].payload).toMatchObject({ event_start: '2026-09-05', event_end: '2026-09-05' })
    // Delete the cascade in moveBookedJob and this line is what catches it: the
    // radar filters on `lead.event_date === date`.
    expect(updatesFor(LEAD)[0].payload).toMatchObject({ event_date: '2026-09-05' })
    expect(store.txCount).toBe(1)
    expect(updatesFor(EVENT)[0].tx).toBe(updatesFor(LEAD)[0].tx)
    expect(store.orderViolations).toBe(0)
  })

  it('moves a tentative hold by writing Lead.event_date', async () => {
    const res = await rescheduleCalendarItem('acme', { kind: 'lead', id: 'l1', date: '2026-10-01' })
    expect(res).toEqual({ moved: 1, failures: [] })
    expect(updatesFor(LEAD)[0].payload).toMatchObject({ event_date: '2026-10-01' })
    expect(updatesFor(EVENT)).toHaveLength(0)
  })

  it('keeps every guard the batch has', async () => {
    await expect(
      rescheduleCalendarItem('acme', { kind: 'invoice_due' as never, id: 'i1', date: '2026-10-01' })
    ).rejects.toThrow('cannot be rescheduled')
    await expect(rescheduleCalendarItem('acme', { kind: 'lead', id: 'l1', date: 'soon' })).rejects.toThrow('valid date')
    vi.mocked(orgIdBySlug).mockResolvedValue(null)
    await expect(rescheduleCalendarItem('x', { kind: 'lead', id: 'l1', date: '2026-10-01' })).rejects.toThrow('Org not found')
    expect(store.updates).toHaveLength(0)
  })

  it('reports a per-item refusal instead of throwing, so the grid can restore', async () => {
    const res = await rescheduleCalendarItem('acme', { kind: 'event', id: 'ghost', date: '2026-09-05' })
    expect(res).toEqual({ moved: 0, failures: [{ kind: 'event', id: 'ghost', message: 'Job not found' }] })
  })

  it('logs the reschedule against the opportunity', async () => {
    await rescheduleCalendarItem('acme', { kind: 'event', id: 'e1', date: '2026-09-05' })
    expect(logActivity).toHaveBeenCalledWith('org-1', expect.objectContaining({
      parent_type: 'opportunity', parent_id: 'l1', summary: 'Rescheduled to 2026-09-05',
    }))
  })
})

describe('rescheduleCalendarItem — the time-of-day write (drag-to-retime, edge-drag-to-resize)', () => {
  it('writes Event.hours — the field the calendar feed actually reads a time off', async () => {
    await rescheduleCalendarItem('acme', {
      kind: 'event', id: 'e1', date: '2026-08-19', hours: { start: '09:00', end: '12:00' },
    })
    // buildCalendarFeed: `...(e.hours ? { start: e.hours.start, end: e.hours.end } : {})`
    expect(updatesFor(EVENT)[0].payload).toMatchObject({ hours: { start: '09:00', end: '12:00' } })
  })

  it('rides in the SAME transaction as the date cascade', async () => {
    await rescheduleCalendarItem('acme', {
      kind: 'event', id: 'e1', date: '2026-09-05', hours: { start: '09:00', end: '12:00' },
    })
    expect(store.txCount).toBe(1)
    expect(updatesFor(EVENT)[0].payload).toMatchObject({
      event_start: '2026-09-05', event_end: '2026-09-05', hours: { start: '09:00', end: '12:00' },
    })
    // A retimed job that lost its cascade would corrupt the radar just as surely.
    expect(updatesFor(LEAD)[0].payload).toMatchObject({ event_date: '2026-09-05' })
    expect(updatesFor(EVENT)[0].tx).toBe(updatesFor(LEAD)[0].tx)
  })

  it('keeps the SPAN rule while it rewrites the window', async () => {
    store.docs.set(EVENT, { id: 'e1', lead_id: 'l1', event_start: '2026-08-19', event_end: '2026-08-21' })
    await rescheduleCalendarItem('acme', {
      kind: 'event', id: 'e1', date: '2026-09-05', hours: { start: '09:00', end: '12:00' },
    })
    // three-day festival stays three days
    expect(updatesFor(EVENT)[0].payload).toMatchObject({ event_start: '2026-09-05', event_end: '2026-09-07' })
  })

  it('keeps a stored time suffix on event_start/_end in step with the window', async () => {
    store.docs.set(EVENT, {
      id: 'e1', lead_id: 'l1',
      event_start: '2026-08-19T14:00:00.000Z',
      event_end: '2026-08-19T20:30:00.000Z',
    })
    await rescheduleCalendarItem('acme', {
      kind: 'event', id: 'e1', date: '2026-09-05', hours: { start: '09:00', end: '12:00' },
    })
    expect(updatesFor(EVENT)[0].payload).toMatchObject({
      event_start: '2026-09-05T14:00:00.000Z',
      event_end: '2026-09-05T20:30:00.000Z',
    })
  })

  it('leaves the window ALONE on a plain day move', async () => {
    store.docs.set(EVENT, { id: 'e1', lead_id: 'l1', event_start: '2026-08-19', event_end: '2026-08-19', hours: { start: '16:00', end: '20:00' } })
    await rescheduleCalendarItem('acme', { kind: 'event', id: 'e1', date: '2026-09-05' })
    // dragging a job to another DAY must never rewrite its time as a side effect
    expect(updatesFor(EVENT)[0].payload).not.toHaveProperty('hours')
  })

  it('refuses hours on a hold — there is no Event document to put them on', async () => {
    await expect(
      rescheduleCalendarItem('acme', { kind: 'lead', id: 'l1', date: '2026-09-05', hours: { start: '09:00', end: '12:00' } })
    ).rejects.toThrow('Only a booked job has working hours')
    expect(store.updates).toHaveLength(0)
  })

  it('refuses a malformed or inverted window', async () => {
    const bad = [
      { start: '9:00', end: '12:00' },
      { start: '09:00', end: '25:00' },
      { start: '09:00', end: '' },
      { start: '12:00', end: '09:00' },
      { start: '12:00', end: '12:00' },
    ]
    for (const hours of bad) {
      await expect(
        rescheduleCalendarItem('acme', { kind: 'event', id: 'e1', date: '2026-09-05', hours })
      ).rejects.toThrow()
    }
    expect(store.updates).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Confirm-ready clearing path (c) ACROSS WRITE PATHS — inc-2 P2.
//
// `OpsPlan.ready_confirmed` is an operator attestation, and the contract
// (spec 2026-08-23 §P2) is that ANY event date/hours change clears it.
// moveBookedJob is the repo's SECOND event date/hours writer (the first is
// updateEvent in actions/events.ts, whose hook these tests mirror) — without
// the clear, rescheduling a booked job from the calendar leaves "Confirmed
// ready — 9:14 PM" standing for a date that moved.
// ─────────────────────────────────────────────────────────────────────────────
describe('bulkRescheduleAgenda — confirm-ready clearing (inc-2 P2)', () => {
  const CONFIRMED_PLAN = { package_ids: ['wp1'], ready_confirmed: { at: 't0', by: 'u9' } }

  beforeEach(() => {
    vi.mocked(getOpsPlanCore).mockResolvedValue(CONFIRMED_PLAN as never)
  })

  it('clears on a move that changes the day, as the acting admin', async () => {
    const res = await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(res).toEqual({ moved: 1, failures: [] })
    expect(getOpsPlanCore).toHaveBeenCalledWith('org-1', 'e1')
    expect(clearReadyConfirmedCore).toHaveBeenCalledWith('org-1', 'e1', 'u1')
  })

  it('clears AFTER the move transaction commits (post-write, updateEvent-hook parity)', async () => {
    let eventStartWhenCleared: unknown = null
    vi.mocked(clearReadyConfirmedCore).mockImplementation(async () => {
      eventStartWhenCleared = (store.docs.get(EVENT) as Record<string, unknown>).event_start
    })
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    // The business write must already be on the record when the clear fires.
    expect(eventStartWhenCleared).toBe('2026-09-05')
  })

  it('clears on an hours-only retime (same day, new window)', async () => {
    store.docs.set(EVENT, { id: 'e1', lead_id: 'l1', event_start: '2026-08-19', event_end: '2026-08-19', hours: { start: '16:00', end: '20:00' } })
    await bulkRescheduleAgenda('acme', [
      { kind: 'event', id: 'e1', date: '2026-08-19', hours: { start: '09:00', end: '12:00' } },
    ])
    expect(clearReadyConfirmedCore).toHaveBeenCalledWith('org-1', 'e1', 'u1')
  })

  it('clears when a window is SET on a job that had none (absent → present is a change)', async () => {
    await bulkRescheduleAgenda('acme', [
      { kind: 'event', id: 'e1', date: '2026-08-19', hours: { start: '09:00', end: '12:00' } },
    ])
    expect(clearReadyConfirmedCore).toHaveBeenCalled()
  })

  it('does NOT clear on a move to the SAME day (the move applies, the attestation stands)', async () => {
    const res = await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-08-19' }])
    expect(res).toEqual({ moved: 1, failures: [] })
    // Guarded like the updateEvent hook: no real change → not even the cheap plan read.
    expect(getOpsPlanCore).not.toHaveBeenCalled()
    expect(clearReadyConfirmedCore).not.toHaveBeenCalled()
  })

  it('does NOT clear on a same-day move with a time-of-day suffix on the stored window', async () => {
    store.docs.set(EVENT, {
      id: 'e1', lead_id: 'l1',
      event_start: '2026-08-19T14:00:00.000Z',
      event_end: '2026-08-19T20:30:00.000Z',
    })
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-08-19' }])
    expect(clearReadyConfirmedCore).not.toHaveBeenCalled()
  })

  it('does NOT clear when identical hours read back in Firestore key order ({end, start}) — field-wise compare, never serialized', async () => {
    // Production Firestore returns map keys SORTED, the caller sends
    // {start, end} — JSON.stringify of IDENTICAL hours is unequal, the exact
    // bug the updateEvent hook documents. The emulator preserves insertion
    // order, so only this test catches a serialized compare.
    store.docs.set(EVENT, { id: 'e1', lead_id: 'l1', event_start: '2026-08-19', event_end: '2026-08-19', hours: { end: '20:00', start: '16:00' } })
    await bulkRescheduleAgenda('acme', [
      { kind: 'event', id: 'e1', date: '2026-08-19', hours: { start: '16:00', end: '20:00' } },
    ])
    expect(getOpsPlanCore).not.toHaveBeenCalled()
    expect(clearReadyConfirmedCore).not.toHaveBeenCalled()
  })

  it('still clears on a REAL hours change when the stored window reads back in sorted key order', async () => {
    store.docs.set(EVENT, { id: 'e1', lead_id: 'l1', event_start: '2026-08-19', event_end: '2026-08-19', hours: { end: '20:00', start: '16:00' } })
    await bulkRescheduleAgenda('acme', [
      { kind: 'event', id: 'e1', date: '2026-08-19', hours: { start: '15:00', end: '20:00' } },
    ])
    expect(clearReadyConfirmedCore).toHaveBeenCalledWith('org-1', 'e1', 'u1')
  })

  it('does NOT invoke the clearing transaction when the job has no ops plan', async () => {
    vi.mocked(getOpsPlanCore).mockResolvedValue(null)
    const res = await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(res).toEqual({ moved: 1, failures: [] })
    expect(getOpsPlanCore).toHaveBeenCalledWith('org-1', 'e1')
    expect(clearReadyConfirmedCore).not.toHaveBeenCalled()
  })

  it('does NOT invoke the clearing transaction when the plan carries no attestation', async () => {
    vi.mocked(getOpsPlanCore).mockResolvedValue({ package_ids: ['wp1'] } as never)
    await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    expect(clearReadyConfirmedCore).not.toHaveBeenCalled()
  })

  it('hold moves never touch the attestation machinery — a hold has no Event, so no ops plan', async () => {
    await bulkRescheduleAgenda('acme', [{ kind: 'lead', id: 'l1', date: '2026-10-01' }])
    expect(getOpsPlanCore).not.toHaveBeenCalled()
    expect(clearReadyConfirmedCore).not.toHaveBeenCalled()
  })

  it('the drag path (rescheduleCalendarItem) inherits the clearing unchanged', async () => {
    await rescheduleCalendarItem('acme', { kind: 'event', id: 'e1', date: '2026-09-05' })
    expect(clearReadyConfirmedCore).toHaveBeenCalledWith('org-1', 'e1', 'u1')
  })

  it('a failed clear surfaces as the row\'s failure while the move stays applied (updateEvent-hook parity)', async () => {
    vi.mocked(clearReadyConfirmedCore).mockRejectedValue(new Error('clear failed'))
    const res = await bulkRescheduleAgenda('acme', [{ kind: 'event', id: 'e1', date: '2026-09-05' }])
    // The business transaction committed first — the reschedule is real…
    expect((store.docs.get(EVENT) as Record<string, unknown>).event_start).toBe('2026-09-05')
    expect((store.docs.get(LEAD) as Record<string, unknown>).event_date).toBe('2026-09-05')
    // …and the error is reported, not swallowed, so the stale stamp is not silent.
    expect(res.moved).toBe(0)
    expect(res.failures).toEqual([{ kind: 'event', id: 'e1', message: 'clear failed' }])
  })
})
