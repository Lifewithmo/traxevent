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

import { assertOrgAdmin } from '@/lib/auth/assert'
import { orgIdBySlug } from '@/lib/calendar-fetch'
import { logActivity } from '@/lib/activity'
import { bulkRescheduleAgenda } from '@/actions/calendar-bulk'

const EVENT = 'orgs/org-1/events/e1'
const LEAD = 'orgs/org-1/leads/l1'

const updatesFor = (path: string) => store.updates.filter((u) => u.path === path)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(orgIdBySlug).mockResolvedValue('org-1')
  vi.mocked(assertOrgAdmin).mockResolvedValue({ uid: 'u1', role: 'admin', event_access: {} } as never)
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
