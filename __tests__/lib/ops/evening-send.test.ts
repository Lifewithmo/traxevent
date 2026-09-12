import { describe, it, expect, vi, beforeEach } from 'vitest'

// Evening-before run-sheet consumer (inc-3 S1.3 + B1): window math (incl. the
// catch-up hours and DST-transition days via fixed zones), org-local
// tomorrow-boundary math, date-stamped idempotency normalized across the
// mixed-format event_start field (incl. the reschedule self-heal), the
// archived skip (cancel path), opt-out, tz-less skip, per-org failure
// isolation, and the per-evening ACCUMULATING liveness count (catch-up ticks
// must not overwrite a real count with 0).

// The default-deps describes at the bottom exercise the range query, the
// transaction-guarded stamp, and the transaction-guarded accumulating
// liveness write against this firestore stub.
const planGetSpy = vi.hoisted(() => vi.fn())
const planUpdateSpy = vi.hoisted(() => vi.fn())
const orgGetSpy = vi.hoisted(() => vi.fn())
const orgUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const eventsWhereSpy = vi.hoisted(() => vi.fn())
const eventsGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
vi.mock('@/lib/firebase-admin', () => {
  const planDoc = { get: planGetSpy, update: planUpdateSpy }
  const opsColl = { doc: () => planDoc }
  const eventDoc = { collection: () => opsColl }
  // .where() chains (the range query calls it twice) and ends in .get().
  eventsWhereSpy.mockReturnValue({ where: eventsWhereSpy, get: eventsGetSpy })
  const eventsColl = { doc: () => eventDoc, where: eventsWhereSpy }
  const orgDoc = { collection: () => eventsColl, get: orgGetSpy, update: orgUpdateSpy }
  type StubDoc = { get: () => Promise<unknown>; update: (p: unknown) => unknown }
  return {
    adminDb: {
      collection: () => ({ doc: () => orgDoc }),
      runTransaction: async (
        fn: (tx: {
          get: (ref: StubDoc) => Promise<unknown>
          update: (ref: StubDoc, p: unknown) => unknown
        }) => unknown,
      ) => fn({ get: (ref) => ref.get(), update: (ref, p) => ref.update(p) }),
    },
  }
})

import {
  EVENING_WINDOW_END_HOUR,
  EVENING_WINDOW_START_HOUR,
  defaultEveningSendDeps,
  isInEveningWindow,
  nextDay,
  orgClock,
  runEveningSend,
  type EveningSendDeps,
} from '@/lib/ops/evening-send'
import type { Event, OpsPlan, Org } from '@/lib/types'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Pure clock/window/calendar math ──────────────────────────────────────────

describe('orgClock', () => {
  it('resolves the org-local hour and day (Denver, MDT = UTC−6)', () => {
    // 2026-09-12T00:00Z is Fri Sep 11, 6:00 PM in Denver — the UTC DATE is
    // already tomorrow; the org-local date must not be.
    expect(orgClock(new Date('2026-09-12T00:00:00Z'), 'America/Denver'))
      .toEqual({ hour: 18, today: '2026-09-11' })
  })

  it('handles the DST spring-forward day (US 2026: Mar 8) via the zone, not offset math', () => {
    // Evening of the transition day is already MDT (UTC−6).
    expect(orgClock(new Date('2026-03-09T00:00:00Z'), 'America/Denver'))
      .toEqual({ hour: 18, today: '2026-03-08' })
  })

  it('handles the DST fall-back day (US 2026: Nov 1) — evening is MST (UTC−7)', () => {
    expect(orgClock(new Date('2026-11-02T01:00:00Z'), 'America/Denver'))
      .toEqual({ hour: 18, today: '2026-11-01' })
  })

  it('throws on an unknown zone (per-org try/catch turns this into an errors count)', () => {
    expect(() => orgClock(new Date('2026-09-12T00:00:00Z'), 'Not/AZone')).toThrow()
  })
})

describe('isInEveningWindow (B1: org-local hour ∈ [18, 21], inclusive)', () => {
  it('rejects 17:xx', () => expect(isInEveningWindow(17)).toBe(false))
  it('accepts 18:xx (the send hour)', () => expect(isInEveningWindow(18)).toBe(true))
  it('accepts 21:xx (the last catch-up hour)', () => expect(isInEveningWindow(21)).toBe(true))
  it('rejects 22:xx', () => expect(isInEveningWindow(22)).toBe(false))
  it('constants match the documented window', () => {
    expect(EVENING_WINDOW_START_HOUR).toBe(18)
    expect(EVENING_WINDOW_END_HOUR).toBe(21)
  })
})

describe('nextDay (org-local calendar math)', () => {
  it('rolls a plain day', () => expect(nextDay('2026-09-11')).toBe('2026-09-12'))
  it('rolls a month boundary', () => expect(nextDay('2026-09-30')).toBe('2026-10-01'))
  it('rolls a year boundary', () => expect(nextDay('2026-12-31')).toBe('2027-01-01'))
  it('knows leap days', () => expect(nextDay('2028-02-28')).toBe('2028-02-29'))
  it('is pure calendar math on a DST-transition day', () =>
    expect(nextDay('2026-03-08')).toBe('2026-03-09'))
  it('throws on garbage', () => expect(() => nextDay('tomorrow')).toThrow())
})

// ── runEveningSend with injected deps ────────────────────────────────────────

// Fri Sep 11 2026, 6:00 PM in Denver (UTC date already Sep 12 — the boundary case).
const NOW = new Date('2026-09-12T00:00:00Z')

function org(over: Partial<Org> = {}): Org {
  return { timezone: 'America/Denver', ...over } as Org
}

function clientJob(over: Partial<Event> = {}): Event {
  return { name: 'Smith Wedding', slug: 's', event_start: '2026-09-12', event_end: '2026-09-12', ...over } as Event
}

function plan(over: Partial<OpsPlan> = {}): OpsPlan {
  return { package_ids: [], requirements: { guests: 10 }, deadlines: [], shopping_list: [], packing_list: [], checklists: [], needs_review: false, change_log: [], created_at: 't', ...over } as OpsPlan
}

interface DepsOverrides extends Partial<EveningSendDeps> {}

function makeDeps(overrides: DepsOverrides = {}) {
  const deps: EveningSendDeps = {
    listOrgs: vi.fn().mockResolvedValue([{ id: 'org-1', org: org() }]),
    listEventsStartingOn: vi.fn().mockResolvedValue([{ id: 'e1', event: clientJob() }]),
    getPlan: vi.fn().mockResolvedValue(plan()),
    getOwnerEmail: vi.fn().mockResolvedValue('owner@demo.co'),
    sendRunSheet: vi.fn().mockResolvedValue(undefined),
    markEveningSent: vi.fn().mockResolvedValue(undefined),
    markOrgRun: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return deps
}

describe('runEveningSend', () => {
  it('sends the run sheet to the org OWNER for a client_job starting tomorrow (org-local)', async () => {
    const deps = makeDeps()
    const summary = await runEveningSend(NOW, deps)

    // Org-local tomorrow: Denver's "today" at NOW is Sep 11, so the query day
    // is Sep 12 — naive UTC math would have asked for Sep 13.
    expect(deps.listEventsStartingOn).toHaveBeenCalledWith('org-1', '2026-09-12')
    expect(deps.sendRunSheet).toHaveBeenCalledWith('org-1', 'e1', 'owner@demo.co')
    expect(deps.markEveningSent).toHaveBeenCalledWith('org-1', 'e1', '2026-09-12')
    expect(deps.markOrgRun).toHaveBeenCalledWith('org-1', NOW.toISOString(), 1, '2026-09-12')
    expect(summary).toEqual({ orgs_scanned: 1, sent: 1, skipped: 0, errors: 0 })
  })

  it('IDEMPOTENT by date stamp: evening_sent_for === event_start ⇒ no second send', async () => {
    const deps = makeDeps({
      getPlan: vi.fn().mockResolvedValue(plan({ evening_sent_for: '2026-09-12' })),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.sendRunSheet).not.toHaveBeenCalled()
    expect(deps.markEveningSent).not.toHaveBeenCalled()
    // A quiet covered night is still a PROCESSED night — liveness stamps with 0.
    expect(deps.markOrgRun).toHaveBeenCalledWith('org-1', NOW.toISOString(), 0, '2026-09-12')
    expect(summary).toEqual({ orgs_scanned: 1, sent: 0, skipped: 0, errors: 0 })
  })

  it('NORMALIZED idempotency: a pre-fix full-ISO stamp for the SAME date still counts as sent', async () => {
    const deps = makeDeps({
      listEventsStartingOn: vi.fn().mockResolvedValue([
        { id: 'e1', event: clientJob({ event_start: '2026-09-12T14:00:00.000Z' }) },
      ]),
      getPlan: vi.fn().mockResolvedValue(plan({ evening_sent_for: '2026-09-12T14:00:00.000Z' })),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.sendRunSheet).not.toHaveBeenCalled()
    expect(deps.markEveningSent).not.toHaveBeenCalled()
    expect(summary.sent).toBe(0)
  })

  it('an ISO-suffixed event_start sends and stamps the SLICED date (mixed-format field)', async () => {
    const deps = makeDeps({
      listEventsStartingOn: vi.fn().mockResolvedValue([
        { id: 'e1', event: clientJob({ event_start: '2026-09-12T14:00:00.000Z' }) },
      ]),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.sendRunSheet).toHaveBeenCalledWith('org-1', 'e1', 'owner@demo.co')
    expect(deps.markEveningSent).toHaveBeenCalledWith('org-1', 'e1', '2026-09-12')
    expect(summary.sent).toBe(1)
  })

  it('RESCHEDULE SELF-HEAL: a stamp for a previous date no longer matches, so the new date sends again', async () => {
    const deps = makeDeps({
      getPlan: vi.fn().mockResolvedValue(plan({ evening_sent_for: '2026-09-05' })),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.sendRunSheet).toHaveBeenCalledWith('org-1', 'e1', 'owner@demo.co')
    expect(deps.markEveningSent).toHaveBeenCalledWith('org-1', 'e1', '2026-09-12')
    expect(summary.sent).toBe(1)
  })

  it('reschedule self-heal holds ACROSS FORMATS: a full-ISO stamp for a different date resends', async () => {
    const deps = makeDeps({
      getPlan: vi.fn().mockResolvedValue(plan({ evening_sent_for: '2026-09-05T14:00:00.000Z' })),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.sendRunSheet).toHaveBeenCalledWith('org-1', 'e1', 'owner@demo.co')
    expect(deps.markEveningSent).toHaveBeenCalledWith('org-1', 'e1', '2026-09-12')
    expect(summary.sent).toBe(1)
  })

  it('ARCHIVED events never get the evening send — the cancel path leaves the plan intact', async () => {
    const deps = makeDeps({
      listEventsStartingOn: vi.fn().mockResolvedValue([
        { id: 'a1', event: clientJob({ status: 'archived' }) },
      ]),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.getPlan).not.toHaveBeenCalled()
    expect(deps.sendRunSheet).not.toHaveBeenCalled()
    // A skipped-archived event must NOT get evening_sent_for stamped either.
    expect(deps.markEveningSent).not.toHaveBeenCalled()
    expect(summary).toEqual({ orgs_scanned: 1, sent: 0, skipped: 0, errors: 0 })
  })

  it('DRAFT events still participate — siblings (horizon/run/calendar) only exclude archived', async () => {
    const deps = makeDeps({
      listEventsStartingOn: vi.fn().mockResolvedValue([
        { id: 'd1', event: clientJob({ status: 'draft' }) },
      ]),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.sendRunSheet).toHaveBeenCalledWith('org-1', 'd1', 'owner@demo.co')
    expect(summary.sent).toBe(1)
  })

  it('skips tz-less orgs as DOCUMENTED behavior, not an error', async () => {
    const deps = makeDeps({ listOrgs: vi.fn().mockResolvedValue([{ id: 'org-1', org: {} as Org }]) })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.listEventsStartingOn).not.toHaveBeenCalled()
    expect(deps.markOrgRun).not.toHaveBeenCalled()
    expect(summary).toEqual({ orgs_scanned: 1, sent: 0, skipped: 1, errors: 0 })
  })

  it('respects the org opt-out', async () => {
    const deps = makeDeps({
      listOrgs: vi.fn().mockResolvedValue([
        { id: 'org-1', org: org({ ops_notifications: { evening_run_sheet_opt_out: true } }) },
      ]),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.sendRunSheet).not.toHaveBeenCalled()
    expect(deps.listEventsStartingOn).not.toHaveBeenCalled()
    expect(summary).toEqual({ orgs_scanned: 1, sent: 0, skipped: 1, errors: 0 })
  })

  it('does nothing outside the window (17:59 org-local) — no plan reads at all', async () => {
    const deps = makeDeps()
    const summary = await runEveningSend(new Date('2026-09-11T23:59:00Z'), deps)
    expect(deps.listEventsStartingOn).not.toHaveBeenCalled()
    expect(deps.getPlan).not.toHaveBeenCalled()
    expect(summary).toEqual({ orgs_scanned: 1, sent: 0, skipped: 1, errors: 0 })
  })

  it('still sends at 21:xx org-local — the catch-up window absorbs missed ticks', async () => {
    const deps = makeDeps()
    const summary = await runEveningSend(new Date('2026-09-12T03:30:00Z'), deps)
    expect(summary.sent).toBe(1)
  })

  it('ignores non-client_job events (market days have no run sheet to send)', async () => {
    const deps = makeDeps({
      listEventsStartingOn: vi.fn().mockResolvedValue([
        { id: 'm1', event: clientJob({ kind: 'market_day' }) },
      ]),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.getPlan).not.toHaveBeenCalled()
    expect(deps.sendRunSheet).not.toHaveBeenCalled()
    expect(summary).toEqual({ orgs_scanned: 1, sent: 0, skipped: 0, errors: 0 })
  })

  it('ignores events without an ops plan', async () => {
    const deps = makeDeps({ getPlan: vi.fn().mockResolvedValue(null) })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.sendRunSheet).not.toHaveBeenCalled()
    expect(summary.sent).toBe(0)
  })

  it('PER-ORG ISOLATION: one org throwing does not kill the tick, and the summary counts it', async () => {
    const deps = makeDeps({
      listOrgs: vi.fn().mockResolvedValue([
        { id: 'bad-org', org: org() },
        { id: 'good-org', org: org() },
      ]),
      listEventsStartingOn: vi
        .fn()
        .mockImplementation(async (orgId: string) => {
          if (orgId === 'bad-org') throw new Error('firestore exploded')
          return [{ id: 'e1', event: clientJob() }]
        }),
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const summary = await runEveningSend(NOW, deps)
    consoleSpy.mockRestore()
    expect(deps.sendRunSheet).toHaveBeenCalledWith('good-org', 'e1', 'owner@demo.co')
    expect(deps.markOrgRun).toHaveBeenCalledWith('good-org', NOW.toISOString(), 1, '2026-09-12')
    expect(summary).toEqual({ orgs_scanned: 2, sent: 1, skipped: 0, errors: 1 })
  })

  it('a failed SEND leaves the stamp unset (next in-window tick retries) and counts an error', async () => {
    const deps = makeDeps({ sendRunSheet: vi.fn().mockRejectedValue(new Error('resend down')) })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const summary = await runEveningSend(NOW, deps)
    consoleSpy.mockRestore()
    expect(deps.markEveningSent).not.toHaveBeenCalled()
    expect(deps.markOrgRun).toHaveBeenCalledWith('org-1', NOW.toISOString(), 0, '2026-09-12')
    expect(summary).toEqual({ orgs_scanned: 1, sent: 0, skipped: 0, errors: 1 })
  })

  it('an org with no owner email is an ERROR (visible failure), never a silent skip', async () => {
    const deps = makeDeps({ getOwnerEmail: vi.fn().mockResolvedValue(undefined) })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const summary = await runEveningSend(NOW, deps)
    consoleSpy.mockRestore()
    expect(deps.sendRunSheet).not.toHaveBeenCalled()
    expect(summary.errors).toBe(1)
  })

  it('a saved zone Intl cannot resolve is an ERROR (broken config), not a documented skip', async () => {
    const deps = makeDeps({
      listOrgs: vi.fn().mockResolvedValue([{ id: 'org-1', org: org({ timezone: 'Not/AZone' }) }]),
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const summary = await runEveningSend(NOW, deps)
    consoleSpy.mockRestore()
    expect(summary).toEqual({ orgs_scanned: 1, sent: 0, skipped: 0, errors: 1 })
  })

  it('one owner lookup covers many events in the same org', async () => {
    const deps = makeDeps({
      listEventsStartingOn: vi.fn().mockResolvedValue([
        { id: 'e1', event: clientJob() },
        { id: 'e2', event: clientJob({ name: 'Second Job' }) },
      ]),
    })
    const summary = await runEveningSend(NOW, deps)
    expect(deps.getOwnerEmail).toHaveBeenCalledTimes(1)
    expect(summary.sent).toBe(2)
    expect(deps.markOrgRun).toHaveBeenCalledWith('org-1', NOW.toISOString(), 2, '2026-09-12')
  })
})

// ── Tick sequences (D3): the liveness count must survive catch-up ticks ──────
//
// These run the REAL default-deps markEveningSent + markOrgRun against
// stateful stubs, so the idempotency stamp and the accumulating count interact
// exactly as they do in production across a whole evening of hourly ticks.

function statefulStores() {
  let planState = plan()
  planGetSpy.mockImplementation(async () => ({ exists: true, data: () => planState }))
  planUpdateSpy.mockImplementation((p: Partial<OpsPlan>) => {
    planState = { ...planState, ...p }
  })
  let orgState = org()
  orgGetSpy.mockImplementation(async () => ({ exists: true, data: () => orgState }))
  orgUpdateSpy.mockImplementation((p: Record<string, unknown>) => {
    orgState = {
      ...orgState,
      ops_notifications: {
        ...orgState.ops_notifications,
        last_evening_run_at: p['ops_notifications.last_evening_run_at'] as string,
        last_evening_sent_count: p['ops_notifications.last_evening_sent_count'] as number,
        last_evening_for: p['ops_notifications.last_evening_for'] as string,
      },
    }
  })
  return {
    notifications: () => orgState.ops_notifications,
    getPlan: async () => planState,
  }
}

describe('tick sequences (accumulating liveness count)', () => {
  // Denver evening of Sep 11: 18:05 / 19:05 / 20:05 / 21:05 local.
  const TICKS = [
    '2026-09-12T00:05:00Z',
    '2026-09-12T01:05:00Z',
    '2026-09-12T02:05:00Z',
    '2026-09-12T03:05:00Z',
  ]

  it('4 in-window ticks, send on tick 1, quiet catch-ups → final count 1 with the LATEST timestamp', async () => {
    const store = statefulStores()
    const dd = defaultEveningSendDeps()
    const deps = makeDeps({
      getPlan: store.getPlan,
      markEveningSent: dd.markEveningSent,
      markOrgRun: dd.markOrgRun,
    })
    for (const t of TICKS) await runEveningSend(new Date(t), deps)
    expect(deps.sendRunSheet).toHaveBeenCalledTimes(1)
    // Pre-fix behavior stamped 0 here (ticks 2–4 each overwrote the count).
    expect(store.notifications()).toEqual({
      last_evening_run_at: '2026-09-12T03:05:00.000Z',
      last_evening_sent_count: 1,
      last_evening_for: '2026-09-12',
    })
  })

  it('a NEW evening resets the count instead of accumulating across nights', async () => {
    const store = statefulStores()
    const dd = defaultEveningSendDeps()
    const deps = makeDeps({
      getPlan: store.getPlan,
      markEveningSent: dd.markEveningSent,
      markOrgRun: dd.markOrgRun,
    })
    for (const t of TICKS) await runEveningSend(new Date(t), deps)
    expect(store.notifications()?.last_evening_sent_count).toBe(1)
    // Next evening (Sep 12, 18:05 Denver): the only candidate is already
    // stamped for its own date, so nothing sends — the count must reset to 0
    // for the NEW evening, not carry yesterday's 1.
    await runEveningSend(new Date('2026-09-13T00:05:00Z'), deps)
    expect(store.notifications()).toEqual({
      last_evening_run_at: '2026-09-13T00:05:00.000Z',
      last_evening_sent_count: 0,
      last_evening_for: '2026-09-13',
    })
  })

  it('two sends across two ticks (second event booked between ticks) ACCUMULATE to 2', async () => {
    const store = statefulStores()
    // Per-event stamp map — the shared plan-doc stub can't distinguish two
    // events, and per-event stamping is covered by the default-deps describe.
    const stamps: Record<string, string> = {}
    const deps = makeDeps({
      listEventsStartingOn: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'e1', event: clientJob() }])
        .mockResolvedValueOnce([
          { id: 'e1', event: clientJob() },
          { id: 'e2', event: clientJob({ name: 'Booked Tonight' }) },
        ]),
      getPlan: async (_orgId: string, eventId: string) =>
        plan(stamps[eventId] ? { evening_sent_for: stamps[eventId] } : {}),
      markEveningSent: async (_orgId: string, eventId: string, d: string) => {
        stamps[eventId] = d
      },
      markOrgRun: defaultEveningSendDeps().markOrgRun,
    })
    await runEveningSend(new Date(TICKS[0]), deps)
    await runEveningSend(new Date(TICKS[1]), deps)
    expect(deps.sendRunSheet).toHaveBeenCalledTimes(2)
    expect(store.notifications()?.last_evening_sent_count).toBe(2)
    expect(store.notifications()?.last_evening_for).toBe('2026-09-12')
  })
})

// ── Default Firestore deps: query shape, transaction-guarded stamp, liveness ─

describe('defaultEveningSendDeps.listEventsStartingOn (range, not equality — mixed-format event_start)', () => {
  it('queries [day, nextDay) so an ISO-suffixed event_start is matched', async () => {
    eventsGetSpy.mockResolvedValueOnce({
      docs: [{ id: 'e1', data: () => clientJob({ event_start: '2026-09-12T14:00:00.000Z' }) }],
    })
    const rows = await defaultEveningSendDeps().listEventsStartingOn('o1', '2026-09-12')
    // Equality ('==') would silently miss '2026-09-12T14:00:00.000Z' — the
    // range brackets the whole day by string order on the SAME single field.
    expect(eventsWhereSpy).toHaveBeenNthCalledWith(1, 'event_start', '>=', '2026-09-12')
    expect(eventsWhereSpy).toHaveBeenNthCalledWith(2, 'event_start', '<', '2026-09-13')
    expect(rows).toEqual([
      { id: 'e1', event: expect.objectContaining({ event_start: '2026-09-12T14:00:00.000Z' }) },
    ])
  })
})

describe('defaultEveningSendDeps.markEveningSent (transaction-guarded, only-if-not-covering-this-date)', () => {
  it('stamps an unstamped plan with the covered event_start', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => plan() })
    await defaultEveningSendDeps().markEveningSent('o1', 'e1', '2026-09-12')
    expect(planUpdateSpy).toHaveBeenCalledWith({ evening_sent_for: '2026-09-12' })
  })

  it('leaves a plan already covering THIS date alone (concurrent tick guard)', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => plan({ evening_sent_for: '2026-09-12' }) })
    await defaultEveningSendDeps().markEveningSent('o1', 'e1', '2026-09-12')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })

  it('OVERWRITES a stamp from a previous date — the reschedule self-heal', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => plan({ evening_sent_for: '2026-09-05' }) })
    await defaultEveningSendDeps().markEveningSent('o1', 'e1', '2026-09-12')
    expect(planUpdateSpy).toHaveBeenCalledWith({ evening_sent_for: '2026-09-12' })
  })

  it('a PRE-FIX full-ISO stamp for the same date still counts as covered (stored side sliced too)', async () => {
    planGetSpy.mockResolvedValue({
      exists: true,
      data: () => plan({ evening_sent_for: '2026-09-12T14:00:00.000Z' }),
    })
    await defaultEveningSendDeps().markEveningSent('o1', 'e1', '2026-09-12')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })

  it('writes the SLICED date even when handed a suffixed event_start (the field is date-stamped)', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => plan() })
    await defaultEveningSendDeps().markEveningSent('o1', 'e1', '2026-09-12T18:30:00.000Z')
    expect(planUpdateSpy).toHaveBeenCalledWith({ evening_sent_for: '2026-09-12' })
  })

  it('no-ops when the plan vanished', async () => {
    planGetSpy.mockResolvedValue({ exists: false })
    await defaultEveningSendDeps().markEveningSent('o1', 'e1', '2026-09-12')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })
})

describe('defaultEveningSendDeps.markOrgRun (transaction, per-evening accumulating count)', () => {
  it('first stamp of an evening writes the run count + covered evening, dot-path (opt-out survives)', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => org() })
    await defaultEveningSendDeps().markOrgRun('o1', '2026-09-12T00:10:00.000Z', 1, '2026-09-12')
    expect(orgUpdateSpy).toHaveBeenCalledWith({
      'ops_notifications.last_evening_run_at': '2026-09-12T00:10:00.000Z',
      'ops_notifications.last_evening_sent_count': 1,
      'ops_notifications.last_evening_for': '2026-09-12',
    })
  })

  it('a later tick covering the SAME evening accumulates (here +0) — never overwrites a real count', async () => {
    orgGetSpy.mockResolvedValue({
      exists: true,
      data: () =>
        org({
          ops_notifications: {
            last_evening_run_at: '2026-09-12T00:10:00.000Z',
            last_evening_sent_count: 1,
            last_evening_for: '2026-09-12',
          },
        }),
    })
    await defaultEveningSendDeps().markOrgRun('o1', '2026-09-12T01:10:00.000Z', 0, '2026-09-12')
    expect(orgUpdateSpy).toHaveBeenCalledWith({
      'ops_notifications.last_evening_run_at': '2026-09-12T01:10:00.000Z',
      'ops_notifications.last_evening_sent_count': 1,
      'ops_notifications.last_evening_for': '2026-09-12',
    })
  })

  it('a NEW evening resets the count to this run\'s own sends', async () => {
    orgGetSpy.mockResolvedValue({
      exists: true,
      data: () =>
        org({
          ops_notifications: { last_evening_sent_count: 5, last_evening_for: '2026-09-11' },
        }),
    })
    await defaultEveningSendDeps().markOrgRun('o1', '2026-09-12T00:10:00.000Z', 0, '2026-09-12')
    expect(orgUpdateSpy).toHaveBeenCalledWith({
      'ops_notifications.last_evening_run_at': '2026-09-12T00:10:00.000Z',
      'ops_notifications.last_evening_sent_count': 0,
      'ops_notifications.last_evening_for': '2026-09-12',
    })
  })

  it('a legacy org doc with no last_evening_for treats the run as a fresh evening', async () => {
    orgGetSpy.mockResolvedValue({
      exists: true,
      data: () =>
        org({
          ops_notifications: {
            last_evening_run_at: '2026-09-11T00:10:00.000Z',
            last_evening_sent_count: 3,
          },
        }),
    })
    await defaultEveningSendDeps().markOrgRun('o1', '2026-09-12T00:10:00.000Z', 1, '2026-09-12')
    expect(orgUpdateSpy).toHaveBeenCalledWith({
      'ops_notifications.last_evening_run_at': '2026-09-12T00:10:00.000Z',
      'ops_notifications.last_evening_sent_count': 1,
      'ops_notifications.last_evening_for': '2026-09-12',
    })
  })

  it('no-ops when the org doc vanished', async () => {
    orgGetSpy.mockResolvedValue({ exists: false })
    await defaultEveningSendDeps().markOrgRun('o1', '2026-09-12T00:10:00.000Z', 1, '2026-09-12')
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })
})
