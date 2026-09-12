import { describe, it, expect, vi, beforeEach } from 'vitest'

// Evening-before run-sheet consumer (inc-3 S1.3 + B1): window math (incl. the
// catch-up hours and DST-transition days via fixed zones), org-local
// tomorrow-boundary math, date-stamped idempotency (incl. the reschedule
// self-heal), opt-out, tz-less skip, and per-org failure isolation.

// The default-deps describe at the bottom exercises the transaction-guarded
// stamp + the dot-path liveness write against this firestore stub.
const planGetSpy = vi.hoisted(() => vi.fn())
const planUpdateSpy = vi.hoisted(() => vi.fn())
const orgUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/lib/firebase-admin', () => {
  const planDoc = { get: planGetSpy, update: planUpdateSpy }
  const opsColl = { doc: () => planDoc }
  const eventDoc = { collection: () => opsColl }
  const eventsColl = { doc: () => eventDoc }
  const orgDoc = { collection: () => eventsColl, update: orgUpdateSpy }
  return {
    adminDb: {
      collection: () => ({ doc: () => orgDoc }),
      runTransaction: async (
        fn: (tx: {
          get: (ref: typeof planDoc) => Promise<unknown>
          update: (ref: typeof planDoc, p: unknown) => unknown
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
    expect(deps.markOrgRun).toHaveBeenCalledWith('org-1', NOW.toISOString(), 1)
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
    expect(deps.markOrgRun).toHaveBeenCalledWith('org-1', NOW.toISOString(), 0)
    expect(summary).toEqual({ orgs_scanned: 1, sent: 0, skipped: 0, errors: 0 })
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
    expect(deps.markOrgRun).toHaveBeenCalledWith('good-org', NOW.toISOString(), 1)
    expect(summary).toEqual({ orgs_scanned: 2, sent: 1, skipped: 0, errors: 1 })
  })

  it('a failed SEND leaves the stamp unset (next in-window tick retries) and counts an error', async () => {
    const deps = makeDeps({ sendRunSheet: vi.fn().mockRejectedValue(new Error('resend down')) })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const summary = await runEveningSend(NOW, deps)
    consoleSpy.mockRestore()
    expect(deps.markEveningSent).not.toHaveBeenCalled()
    expect(deps.markOrgRun).toHaveBeenCalledWith('org-1', NOW.toISOString(), 0)
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
    expect(deps.markOrgRun).toHaveBeenCalledWith('org-1', NOW.toISOString(), 2)
  })
})

// ── Default Firestore deps: the transaction-guarded stamp + liveness write ───

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

  it('no-ops when the plan vanished', async () => {
    planGetSpy.mockResolvedValue({ exists: false })
    await defaultEveningSendDeps().markEveningSent('o1', 'e1', '2026-09-12')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })
})

describe('defaultEveningSendDeps.markOrgRun', () => {
  it('dot-path updates so the opt-out flag survives the liveness write', async () => {
    await defaultEveningSendDeps().markOrgRun('o1', '2026-09-12T00:00:00.000Z', 1)
    expect(orgUpdateSpy).toHaveBeenCalledWith({
      'ops_notifications.last_evening_run_at': '2026-09-12T00:00:00.000Z',
      'ops_notifications.last_evening_sent_count': 1,
    })
  })
})
