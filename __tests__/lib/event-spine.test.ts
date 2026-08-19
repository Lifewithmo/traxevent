import { describe, it, expect, vi, beforeEach } from 'vitest'

const familiesGet = vi.hoisted(() => vi.fn())
const familiesOrderBy = vi.hoisted(() => vi.fn(() => ({ get: familiesGet })))
const planGet = vi.hoisted(() => vi.fn())
const closeoutGet = vi.hoisted(() => vi.fn())
const itineraryGet = vi.hoisted(() => vi.fn())
const invoicesGet = vi.hoisted(() => vi.fn())
const invoicesOrderBy = vi.hoisted(() => vi.fn(() => ({ get: invoicesGet })))
const invoicesWhere = vi.hoisted(() => vi.fn(() => ({ orderBy: invoicesOrderBy })))

// orgs/{o}/events/{e}/ops/{plan|closeout} — the ops doc call branches on id.
const opsDoc = vi.hoisted(() => vi.fn((id: string) => ({ get: id === 'closeout' ? closeoutGet : planGet })))
// orgs/{o}/events/{e}/{families|itinerary|ops} — the leaf collection call branches on name.
const leafCollection = vi.hoisted(() =>
  vi.fn((name: string) =>
    name === 'families'
      ? { orderBy: familiesOrderBy }
      : name === 'itinerary'
        ? { get: itineraryGet }
        : { doc: opsDoc }
  )
)

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        // orgs/{o}/{events|invoices} — branches on the second-level collection.
        collection: (name: string) =>
          name === 'invoices'
            ? { where: invoicesWhere }
            : { doc: () => ({ collection: leafCollection }) },
      }),
    }),
  },
}))

import {
  getEventSpineKpis,
  computeEventBlockers,
  computeEventVerdict,
  computeEventNba,
  eventPhaseOf,
  formatClockTime,
  resolveJobTime,
  backPlanChips,
  formatJobDay,
  type EventArSummary,
} from '@/lib/event-spine'
import type { EventPage } from '@/lib/types'

const TODAY = '2026-08-19'
const EVENT = { event_start: '2099-09-12' }
const ALL_PAGES: EventPage[] = ['dashboard', 'families', 'ops', 'reports']

const FAMILY_DOCS = [
  { registration_status: 'confirmed', payment_status: 'paid', amount_due: 500, amount_paid: 500, created_at: '2026-08-01T00:00:00.000Z' },
  { registration_status: 'confirmed', payment_status: 'partial', amount_due: 400, amount_paid: 100, created_at: '2026-08-02T00:00:00.000Z' },
  { registration_status: 'pending', payment_status: 'unpaid', amount_due: 300, amount_paid: 0, created_at: '2026-08-03T00:00:00.000Z' },
].map((data, i) => ({ id: `fam-${i}`, data: () => data }))

// flags: deadlines [true, false] + shopping [true] + packing [false] +
// checklist steps [false] → done 2 / total 5 → 40%; no overdue (d2 is future).
const PLAN = {
  requirements: { guests: 40 },
  deadlines: [
    { id: 'd1', label: 'Book rentals', due: '2020-01-01', done: true },
    { id: 'd2', label: 'Order ice', due: '2099-01-01', done: false },
  ],
  shopping_list: [{ resource_id: 'r1', name: 'Cups', qty: 100, checked: true }],
  packing_list: [{ resource_id: 'r2', name: 'Kegerator', qty: 1, checked: false }],
  checklists: [{ id: 'c1', steps: [{ text: 'x', done: false }] }],
}

// Sent deposit, unpaid + overdue ($200 due 2020) and a sent final with $500
// still open (due 2099) → invoiced 1000, outstanding 700, overdue 200.
const INVOICE_DOCS = [
  {
    id: 'inv-1', type: 'deposit', lifecycle: 'sent', due_date: '2020-01-01',
    line_items: [{ description: 'Deposit', quantity: 1, unit_price: 200 }],
    payments: [], created_at: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'inv-2', type: 'final', lifecycle: 'sent', due_date: '2099-01-05',
    line_items: [{ description: 'Balance', quantity: 1, unit_price: 800 }],
    payments: [{ amount: 300, at: '2026-08-01T00:00:00.000Z' }], created_at: '2026-07-02T00:00:00.000Z',
  },
].map((data) => ({ id: data.id, data: () => data }))

function callInput(overrides: Record<string, unknown> = {}) {
  return {
    orgId: 'o1', eventId: 'e1', event: EVENT, allowedPages: ALL_PAGES,
    includeMoney: true, today: TODAY,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  familiesGet.mockResolvedValue({ docs: FAMILY_DOCS })
  planGet.mockResolvedValue({ exists: true, data: () => PLAN })
  closeoutGet.mockResolvedValue({ exists: false })
  itineraryGet.mockResolvedValue({ docs: [] })
  invoicesGet.mockResolvedValue({ docs: [] })
})

describe('getEventSpineKpis', () => {
  it('aggregates registrations, financials, and readiness when everything is readable', async () => {
    const kpis = await getEventSpineKpis(callInput())

    expect(kpis.registrations).toMatchObject({
      total: 3,
      byStatus: { confirmed: 2, pending: 1 },
    })
    expect(kpis.financial).toMatchObject({ totalDue: 1200, totalPaid: 600, outstanding: 600 })
    expect(kpis.readiness).toMatchObject({ done: 2, total: 5, pct: 40, overdue: 0 })
    expect(kpis.ops).toEqual({ hasPlan: true, loadlist: { packed: 1, total: 2 } })
    // No overdue deadline → the load list and pending registrations remain.
    expect(kpis.blockers.map((b) => b.kind)).toEqual(['loadlist', 'registrations'])
    expect(kpis.blockers[0].label).toBe('Load list 1 of 2 packed')
    expect(kpis.blockers[1].label).toBe('1 registration pending')
    // Mirrors the getAdminFamilies query shape exactly.
    expect(familiesOrderBy).toHaveBeenCalledWith('created_at', 'desc')
  })

  it('skips the families read entirely when neither families nor reports is an allowed page', async () => {
    const kpis = await getEventSpineKpis(callInput({ allowedPages: ['dashboard', 'ops'] }))

    expect(kpis.registrations).toBeNull()
    expect(kpis.financial).toBeNull()
    expect(familiesGet).not.toHaveBeenCalled()
    // Ops is still allowed, so readiness survives the gate.
    expect(kpis.readiness).toMatchObject({ pct: 40 })
  })

  it('allows the families read on a reports-only grant — Reports shows the same figures', async () => {
    const kpis = await getEventSpineKpis(callInput({ allowedPages: ['dashboard', 'reports'] }))

    expect(kpis.registrations).toMatchObject({ total: 3, byStatus: { confirmed: 2, pending: 1 } })
    expect(kpis.financial).toMatchObject({ totalDue: 1200, totalPaid: 600, outstanding: 600 })
    // Ops stays gated off for this member.
    expect(kpis.readiness).toBeNull()
    expect(kpis.ops).toBeNull()
    expect(planGet).not.toHaveBeenCalled()
  })

  it('skips the ops + closeout reads when ops is not an allowed page', async () => {
    const kpis = await getEventSpineKpis(callInput({ allowedPages: ['dashboard', 'families'] }))

    expect(kpis.readiness).toBeNull()
    expect(kpis.ops).toBeNull()
    expect(kpis.closeout).toBeNull()
    expect(planGet).not.toHaveBeenCalled()
    expect(closeoutGet).not.toHaveBeenCalled()
    expect(kpis.registrations).toMatchObject({ total: 3 })
  })

  it('yields readiness = null but ops.hasPlan = false when the event has no ops plan yet', async () => {
    planGet.mockResolvedValue({ exists: false })
    const kpis = await getEventSpineKpis(callInput())

    expect(kpis.readiness).toBeNull()
    expect(kpis.ops).toEqual({ hasPlan: false, loadlist: { packed: 0, total: 0 } })
    // No plan → no plan-derived blockers; the registrations one survives.
    expect(kpis.blockers.map((b) => b.kind)).toEqual(['registrations'])
    expect(kpis.registrations).toMatchObject({ total: 3 })
    expect(kpis.financial).toMatchObject({ outstanding: 600 })
  })

  it('swallows a throwing families read — that section is null, nothing throws', async () => {
    familiesGet.mockRejectedValue(new Error('firestore unavailable'))
    const kpis = await getEventSpineKpis(callInput())

    expect(kpis.registrations).toBeNull()
    expect(kpis.financial).toBeNull()
    expect(kpis.readiness).toMatchObject({ pct: 40 })
  })

  it('swallows a throwing ops read independently of the families section', async () => {
    planGet.mockRejectedValue(new Error('firestore unavailable'))
    const kpis = await getEventSpineKpis(callInput())

    expect(kpis.readiness).toBeNull()
    expect(kpis.ops).toBeNull()
    expect(kpis.registrations).toMatchObject({ total: 3 })
  })

  // ── B4: the owner/admin money gate ─────────────────────────────────────────

  it('keeps ALL money out when includeMoney is false — financial null, lead invoices never read', async () => {
    const kpis = await getEventSpineKpis(callInput({
      includeMoney: false,
      event: { ...EVENT, lead_id: 'lead-1' },
    }))

    expect(kpis.financial).toBeNull()
    expect(kpis.ar).toBeNull()
    expect(invoicesWhere).not.toHaveBeenCalled()
    // Non-money sections are untouched by the gate.
    expect(kpis.registrations).toMatchObject({ total: 3 })
    expect(kpis.readiness).toMatchObject({ pct: 40 })
    // And no money blocker can exist.
    expect(kpis.blockers.every((b) => b.kind !== 'money')).toBe(true)
  })

  it('reads lead AR (listInvoicesCore shape) for includeMoney + lead_id, and flags the unpaid deposit', async () => {
    invoicesGet.mockResolvedValue({ docs: INVOICE_DOCS })
    const kpis = await getEventSpineKpis(callInput({ event: { ...EVENT, lead_id: 'lead-1' } }))

    expect(invoicesWhere).toHaveBeenCalledWith('lead_id', '==', 'lead-1')
    expect(invoicesOrderBy).toHaveBeenCalledWith('created_at', 'desc')
    expect(kpis.ar).toEqual({
      invoiced: 1000,
      outstanding: 700,
      overdueAmount: 200,
      openCount: 2,
      nextDueDate: '2020-01-01',
      deposit: 'unpaid',
    })
    // The deposit outranks the load list in the blocker order.
    expect(kpis.blockers.map((b) => b.kind)).toEqual(['money', 'loadlist', 'registrations'])
    expect(kpis.blockers[0].label).toBe('Deposit unpaid')
  })

  it('skips the AR read when the event has no lead, even for admins', async () => {
    const kpis = await getEventSpineKpis(callInput())
    expect(kpis.ar).toBeNull()
    expect(invoicesWhere).not.toHaveBeenCalled()
  })

  it('swallows a throwing invoices read — ar stays null', async () => {
    invoicesGet.mockRejectedValue(new Error('firestore unavailable'))
    const kpis = await getEventSpineKpis(callInput({ event: { ...EVENT, lead_id: 'lead-1' } }))
    expect(kpis.ar).toBeNull()
    expect(kpis.readiness).toMatchObject({ pct: 40 })
  })

  // ── Closeout presence (wrapped-state NBA, B9) ──────────────────────────────

  it('exposes closeout presence and completion', async () => {
    closeoutGet.mockResolvedValue({ exists: true, data: () => ({ actuals: { sales: 900 }, completed: true, created_at: 'x' }) })
    const kpis = await getEventSpineKpis(callInput())
    expect(kpis.closeout).toEqual({ exists: true, completed: true })
  })

  it('reports a missing closeout doc as exists: false', async () => {
    const kpis = await getEventSpineKpis(callInput())
    expect(kpis.closeout).toEqual({ exists: false, completed: false })
  })

  // ── Itinerary time fallback (B7) ───────────────────────────────────────────

  it('falls back to the earliest itinerary item when no service_start and no event hours', async () => {
    itineraryGet.mockResolvedValue({
      docs: [
        { data: () => ({ day: '2099-09-12', start_time: '15:00', sort_order: 1 }) },
        { data: () => ({ day: '2099-09-12', start_time: '13:30', sort_order: 2 }) },
        { data: () => ({ day: '2099-09-13', start_time: '08:00', sort_order: 0 }) },
      ],
    })
    const kpis = await getEventSpineKpis(callInput({ allowedPages: [...ALL_PAGES, 'itinerary'] }))
    expect(kpis.firstItineraryTime).toBe('13:30')
  })

  it('never reads the itinerary when event hours already answer the time', async () => {
    const kpis = await getEventSpineKpis(callInput({
      allowedPages: [...ALL_PAGES, 'itinerary'],
      event: { ...EVENT, hours: { start: '14:00', end: '20:00' } },
    }))
    expect(itineraryGet).not.toHaveBeenCalled()
    expect(kpis.firstItineraryTime).toBeNull()
  })

  it('never reads the itinerary when the plan has a service_start', async () => {
    planGet.mockResolvedValue({ exists: true, data: () => ({ ...PLAN, requirements: { guests: 40, service_start: '2099-09-12T15:00' } }) })
    const kpis = await getEventSpineKpis(callInput({ allowedPages: [...ALL_PAGES, 'itinerary'] }))
    expect(itineraryGet).not.toHaveBeenCalled()
    expect(kpis.ops).toMatchObject({ serviceStart: '2099-09-12T15:00' })
  })

  it('never reads the itinerary without the itinerary grant', async () => {
    const kpis = await getEventSpineKpis(callInput())
    expect(itineraryGet).not.toHaveBeenCalled()
    expect(kpis.firstItineraryTime).toBeNull()
  })
})

// ── Pure judgment math ───────────────────────────────────────────────────────

const NO_AR: EventArSummary | null = null

describe('computeEventBlockers', () => {
  const plan = {
    deadlines: [
      { id: 'd1', label: 'Order ice', due: '2026-08-17', done: false },
      { id: 'd2', label: 'Book van', due: '2026-08-10', done: true },
      { id: 'd3', label: 'Confirm staff', due: '2026-08-18', done: false },
    ],
    shopping_list: [
      { resource_id: 'r1', name: 'Cups', qty: 100, checked: true },
      { resource_id: 'r2', name: 'Ice', qty: 40, checked: false },
    ],
    packing_list: [{ resource_id: 'r3', name: 'Kegerator', qty: 1, checked: false }],
  }

  it('names the most-overdue deadline BY LABEL with its day count, and counts the rest', () => {
    const blockers = computeEventBlockers({ plan, registrations: null, ar: NO_AR, today: TODAY })
    expect(blockers[0]).toMatchObject({
      kind: 'deadline',
      label: 'Order ice — 2d overdue',
      detail: '+1 more overdue',
      severity: 'alert',
    })
  })

  it('orders deadline → money → loadlist → registrations and caps at 3', () => {
    const ar: EventArSummary = { invoiced: 1000, outstanding: 700, overdueAmount: 200, openCount: 2, deposit: 'unpaid' }
    const blockers = computeEventBlockers({ plan, registrations: { byStatus: { pending: 2 } }, ar, today: TODAY })
    expect(blockers.map((b) => b.kind)).toEqual(['deadline', 'money', 'loadlist'])
    expect(blockers).toHaveLength(3)
  })

  it('reports the load-list packed state as a concrete count', () => {
    const blockers = computeEventBlockers({ plan: { ...plan, deadlines: [] }, registrations: null, ar: NO_AR, today: TODAY })
    expect(blockers[0]).toMatchObject({
      kind: 'loadlist',
      label: 'Load list 1 of 3 packed',
      actionLabel: 'Open load-out — 1 of 3 packed',
      severity: 'info',
    })
  })

  it('falls back to the overdue balance when no deposit invoice is unpaid', () => {
    const ar: EventArSummary = { invoiced: 1000, outstanding: 450, overdueAmount: 450, openCount: 1, deposit: 'paid' }
    const blockers = computeEventBlockers({ plan: null, registrations: null, ar, today: TODAY })
    expect(blockers[0]).toMatchObject({ kind: 'money', label: '$450.00 overdue', severity: 'alert' })
  })

  it('emits nothing when everything is packed, paid, and on schedule', () => {
    const done = {
      deadlines: [{ id: 'd', label: 'x', due: '2026-08-10', done: true }],
      shopping_list: [{ resource_id: 'r', name: 'x', qty: 1, checked: true }],
      packing_list: [],
    }
    const ar: EventArSummary = { invoiced: 1000, outstanding: 0, overdueAmount: 0, openCount: 0, deposit: 'paid' }
    expect(computeEventBlockers({ plan: done, registrations: { byStatus: {} }, ar, today: TODAY })).toEqual([])
  })
})

describe('computeEventVerdict', () => {
  const readyOps = { hasPlan: true, loadlist: { packed: 2, total: 2 } }
  const alertBlocker = { kind: 'deadline' as const, label: 'x', actionLabel: 'x', severity: 'alert' as const }
  const infoBlocker = { kind: 'loadlist' as const, label: 'x', actionLabel: 'x', severity: 'info' as const }

  it('returns null when ops is unreadable — no visibility, no guessed verdict', () => {
    expect(computeEventVerdict({ phase: 'upcoming', ops: null, readiness: null, closeout: null, blockers: [] })).toBeNull()
  })

  it('says No ops plan yet when the plan is missing', () => {
    expect(computeEventVerdict({
      phase: 'upcoming', ops: { hasPlan: false, loadlist: { packed: 0, total: 0 } },
      readiness: null, closeout: null, blockers: [],
    })).toEqual({ label: 'No ops plan yet', tone: 'pending' })
  })

  it('says Not ready on any alert blocker', () => {
    expect(computeEventVerdict({
      phase: 'upcoming', ops: readyOps, readiness: { days_until: 5, done: 4, total: 5, pct: 80, overdue: 1 },
      closeout: null, blockers: [alertBlocker],
    })).toEqual({ label: 'Not ready', tone: 'alert' })
  })

  it('says On track with only info blockers or unfinished prep', () => {
    expect(computeEventVerdict({
      phase: 'upcoming', ops: readyOps, readiness: { days_until: 5, done: 4, total: 5, pct: 80, overdue: 0 },
      closeout: null, blockers: [infoBlocker],
    })).toEqual({ label: 'On track', tone: 'pending' })
  })

  it('says Ready when prep is complete and nothing blocks', () => {
    expect(computeEventVerdict({
      phase: 'upcoming', ops: readyOps, readiness: { days_until: 1, done: 5, total: 5, pct: 100, overdue: 0 },
      closeout: null, blockers: [],
    })).toEqual({ label: 'Ready', tone: 'ok' })
  })

  it('drives the wrapped states off closeout completion', () => {
    expect(computeEventVerdict({ phase: 'wrapped', ops: readyOps, readiness: null, closeout: { exists: false, completed: false }, blockers: [] }))
      .toEqual({ label: 'Wrapped — close out', tone: 'pending' })
    expect(computeEventVerdict({ phase: 'wrapped', ops: readyOps, readiness: null, closeout: { exists: true, completed: true }, blockers: [] }))
      .toEqual({ label: 'Wrapped — closed out', tone: 'ok' })
  })
})

describe('computeEventNba', () => {
  const opsWithPlan = { hasPlan: true, loadlist: { packed: 1, total: 3 } }
  const deadlineBlocker = { kind: 'deadline' as const, label: 'Order ice — 2d overdue', actionLabel: 'Order ice — 2d overdue', severity: 'alert' as const }

  it('promotes the top blocker to THE single primary action (B9)', () => {
    expect(computeEventNba({ phase: 'upcoming', ops: opsWithPlan, closeout: null, blockers: [deadlineBlocker] }))
      .toEqual({ label: 'Order ice — 2d overdue', target: 'ops', fromTopBlocker: true })
  })

  it('routes no-plan to instantiation', () => {
    expect(computeEventNba({ phase: 'upcoming', ops: { hasPlan: false, loadlist: { packed: 0, total: 0 } }, closeout: null, blockers: [] }))
      .toEqual({ label: 'Set up ops plan', target: 'ops', fromTopBlocker: false })
  })

  it('routes day-of to the run sheet even with open blockers', () => {
    expect(computeEventNba({ phase: 'today', ops: opsWithPlan, closeout: null, blockers: [deadlineBlocker] }))
      .toEqual({ label: 'Open run sheet', target: 'ops/runsheet', fromTopBlocker: false })
  })

  it('routes wrapped to closeout until completed, then to the summary', () => {
    expect(computeEventNba({ phase: 'wrapped', ops: opsWithPlan, closeout: { exists: false, completed: false }, blockers: [] }))
      .toEqual({ label: 'Close out (margin pending)', target: 'ops/closeout', fromTopBlocker: false })
    expect(computeEventNba({ phase: 'wrapped', ops: opsWithPlan, closeout: { exists: true, completed: true }, blockers: [] }))
      .toEqual({ label: 'View closeout', target: 'ops/closeout', fromTopBlocker: false })
  })

  it('falls back to the run sheet when fully ready', () => {
    expect(computeEventNba({ phase: 'upcoming', ops: opsWithPlan, closeout: null, blockers: [] }))
      .toEqual({ label: 'Open run sheet', target: 'ops/runsheet', fromTopBlocker: false })
  })

  it('still promotes a visible blocker for ops-gated members, else stays silent', () => {
    const regBlocker = { kind: 'registrations' as const, label: '2 registrations pending', actionLabel: 'Review 2 pending registrations', severity: 'info' as const }
    expect(computeEventNba({ phase: 'upcoming', ops: null, closeout: null, blockers: [regBlocker] }))
      .toEqual({ label: 'Review 2 pending registrations', target: 'families', fromTopBlocker: true })
    expect(computeEventNba({ phase: 'upcoming', ops: null, closeout: null, blockers: [] })).toBeNull()
  })
})

describe('job-strip time helpers', () => {
  it('formats 24h clock times', () => {
    expect(formatClockTime('14:00')).toBe('2:00 PM')
    expect(formatClockTime('00:30')).toBe('12:30 AM')
    expect(formatClockTime('12:05')).toBe('12:05 PM')
    expect(formatClockTime('9:15')).toBe('9:15 AM')
    expect(formatClockTime('25:00')).toBeNull()
    expect(formatClockTime('')).toBeNull()
  })

  it('resolves the honest time label by B7 precedence', () => {
    expect(resolveJobTime({ serviceStart: '2099-09-12T15:00', hoursStart: '14:00', firstItineraryTime: '13:30' }))
      .toEqual({ label: 'Service 3:00 PM', hhmm: '15:00', source: 'service' })
    expect(resolveJobTime({ hoursStart: '14:00', firstItineraryTime: '13:30' }))
      .toEqual({ label: 'Starts 2:00 PM', hhmm: '14:00', source: 'hours' })
    expect(resolveJobTime({ firstItineraryTime: '13:30' }))
      .toEqual({ label: 'First item 1:30 PM', hhmm: '13:30', source: 'itinerary' })
    expect(resolveJobTime({})).toBeNull()
  })

  it('back-plans pack/leave chips from the fixed default buffers', () => {
    expect(backPlanChips('14:00')).toEqual({ packBy: '12:45 PM', leaveBy: '1:30 PM' })
    // Crossing midnight backwards renders nonsense — suppressed instead.
    expect(backPlanChips('00:30')).toBeNull()
  })

  it('formats the job day and derives the phase from countdown vocabulary', () => {
    expect(formatJobDay('2026-08-29')).toBe('Sat Aug 29')
    expect(formatJobDay('nope')).toBe('')
    expect(eventPhaseOf('Wrapped')).toBe('wrapped')
    expect(eventPhaseOf('Today')).toBe('today')
    expect(eventPhaseOf('12d')).toBe('upcoming')
  })
})
