import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ uid: 'admin-1', role: 'admin', event_access: {} }),
  assertEventPage: vi.fn().mockResolvedValue({ uid: 'member-1', role: 'staff', event_access: {} }),
}))

vi.mock('@/lib/ops/event-ops', () => ({
  getOpsPlanCore: vi.fn().mockResolvedValue(null),
  instantiateOpsPlanCore: vi.fn().mockResolvedValue({}),
  updateOpsRequirementsCore: vi.fn().mockResolvedValue(undefined),
  toggleListItemCore: vi.fn().mockResolvedValue(undefined),
  bulkSetListCheckedCore: vi.fn().mockResolvedValue(undefined),
  recomputeOpsListsCore: vi.fn().mockResolvedValue({}),
  completeChecklistStepCore: vi.fn().mockResolvedValue(undefined),
  toggleDeadlineCore: vi.fn().mockResolvedValue(undefined),
  acknowledgeReviewCore: vi.fn().mockResolvedValue(undefined),
  confirmReadyCore: vi.fn().mockResolvedValue({ at: '2026-08-23T21:14:00.000Z', by: 'member-1' }),
}))
vi.mock('@/lib/ops/issues', () => ({
  createIssueCore: vi.fn().mockResolvedValue({}),
  resolveIssueCore: vi.fn().mockResolvedValue(undefined),
  listIssuesCore: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/ops/closeout', () => ({
  getCloseoutCore: vi.fn().mockResolvedValue(null),
  saveActualsCore: vi.fn().mockResolvedValue(undefined),
  closeoutSummaryCore: vi.fn().mockResolvedValue({}),
  completeCloseoutCore: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/itinerary-data', () => ({
  listItineraryCore: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/email', () => ({
  sendRunSheetEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/domains', () => ({
  getVerifiedSendingDomain: vi.fn().mockResolvedValue(undefined),
}))

// sendRunSheet reads the event + org docs directly.
const { eventDocGet, orgDocGet } = vi.hoisted(() => ({
  eventDocGet: vi.fn(),
  orgDocGet: vi.fn(),
}))
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: orgDocGet,
        collection: () => ({ doc: () => ({ get: eventDocGet }) }),
      }),
    }),
  },
}))

import { assertOrgAdmin, assertEventPage } from '@/lib/auth/assert'
import { recomputeOpsListsCore, bulkSetListCheckedCore, confirmReadyCore, getOpsPlanCore } from '@/lib/ops/event-ops'
import { sendRunSheetEmail } from '@/lib/email'
import {
  getOpsPlan, instantiateOpsPlan, updateOpsRequirements, toggleListItem,
  bulkSetListChecked, recomputeOpsLists,
  completeChecklistStep, toggleDeadline, acknowledgeReview, confirmReady, sendRunSheet,
  listIssues, createIssue, resolveIssue,
  getCloseout, saveActuals, getCloseoutSummary, completeCloseout,
} from '@/actions/event-ops'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(assertOrgAdmin).mockResolvedValue({ uid: 'admin-1', role: 'admin', event_access: {} } as never)
  vi.mocked(assertEventPage).mockResolvedValue({ uid: 'member-1', role: 'staff', event_access: {} } as never)
  vi.mocked(confirmReadyCore).mockResolvedValue({ at: '2026-08-23T21:14:00.000Z', by: 'member-1' })
})

describe('event-scoped actions gate on assertEventPage(orgId, eventId, "ops")', () => {
  it('getOpsPlan', async () => {
    await getOpsPlan('o1', 'e1')
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
  })

  it('updateOpsRequirements', async () => {
    await updateOpsRequirements('o1', 'e1', { guests: 10 })
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
  })

  it('toggleListItem', async () => {
    await toggleListItem('o1', 'e1', 'shopping_list', 'r1', true)
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
  })

  it('bulkSetListChecked', async () => {
    await bulkSetListChecked('o1', 'e1', 'packing_list', true)
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
    expect(bulkSetListCheckedCore).toHaveBeenCalledWith('o1', 'e1', 'packing_list', true, undefined)
  })

  it('recomputeOpsLists — passes the member uid and options through', async () => {
    await recomputeOpsLists('o1', 'e1', { guests: 120 })
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
    expect(recomputeOpsListsCore).toHaveBeenCalledWith('o1', 'e1', 'member-1', { guests: 120 })
  })

  it('completeChecklistStep', async () => {
    await completeChecklistStep('o1', 'e1', 'c1', 0, { done: true })
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
  })

  it('toggleDeadline', async () => {
    await toggleDeadline('o1', 'e1', 'd1', true)
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
  })

  it('acknowledgeReview', async () => {
    await acknowledgeReview('o1', 'e1')
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
  })

  it('listIssues / createIssue / resolveIssue', async () => {
    await listIssues('o1', 'e1')
    await createIssue('o1', 'e1', { type: 'equipment', severity: 'low', note: 'x' })
    await resolveIssue('o1', 'e1', 'iss1')
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
    expect(assertEventPage).toHaveBeenCalledTimes(3)
  })

  it('getCloseout / saveActuals / getCloseoutSummary', async () => {
    await getCloseout('o1', 'e1')
    await saveActuals('o1', 'e1', {})
    await getCloseoutSummary('o1', 'e1')
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
    expect(assertEventPage).toHaveBeenCalledTimes(3)
  })
})

describe('confirmReady (inc-2 P2)', () => {
  it('gates on the ops page grant and passes the member uid through', async () => {
    const stamp = await confirmReady('o1', 'e1')
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
    expect(confirmReadyCore).toHaveBeenCalledWith('o1', 'e1', 'member-1')
    expect(stamp).toEqual({ at: '2026-08-23T21:14:00.000Z', by: 'member-1' })
  })
})

describe('sendRunSheet (inc-2 S3.3 — self-send v1)', () => {
  const EVENT = {
    name: 'Smith Wedding',
    slug: 'smith-wedding-2026',
    event_start: '2026-08-29',
    event_end: '2026-08-29',
    hours: { start: '15:00', end: '21:00' },
    location: { name: 'Basque Center', address: '601 W Grove St' },
    key_contacts: [{ name: 'Sam', role: 'Coordinator', phone: '208-555-0000' }],
  }
  const ORG = {
    slug: 'demo',
    name: 'BrewTrax',
    branding: { display_name: 'BrewTrax Events' },
    ops_buffers: { pack_minutes: 50, drive_minutes: 20 },
  }

  beforeEach(() => {
    vi.mocked(assertEventPage).mockResolvedValue({
      uid: 'member-1', role: 'staff', email: 'op@demo.co', event_access: {},
    } as never)
    eventDocGet.mockResolvedValue({ exists: true, data: () => EVENT })
    orgDocGet.mockResolvedValue({ exists: true, data: () => ORG })
    vi.mocked(getOpsPlanCore).mockResolvedValue({
      requirements: { guests: 60, site_needs: ['power'] },
      shopping_list: [{ resource_id: 'r1', name: 'Cups', qty: 100, checked: true }],
      packing_list: [{ resource_id: 'r2', name: 'Kegerator', qty: 1, checked: false }],
      checklists: [
        { id: 'c1', name: 'Setup', phase: 'setup', steps: [{ text: 'x', evidence: 'none', done: true }] },
        { id: 'c2', name: 'Prep', phase: 'prep', steps: [{ text: 'y', evidence: 'none', done: false }] },
      ],
      deadlines: [], needs_review: false, change_log: [], package_ids: [], created_at: 't',
    } as never)
  })

  it('gates on the ops grant and sends INLINE content to the CALLER\'s member email', async () => {
    const result = await sendRunSheet('o1', 'e1')
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
    expect(result).toEqual({ to: 'op@demo.co' })

    const call = vi.mocked(sendRunSheetEmail).mock.calls[0][0]
    expect(call.to).toBe('op@demo.co')
    // The content stands alone: anchor, back-plan under ORG buffers, venue,
    // contacts, site needs, load status — never a login-walled link as the body.
    expect(call.anchor).toEqual({ label: 'Starts', display: '3:00 PM' })
    // 3:00 PM − 20m drive = 2:40 PM; − 50m pack = 1:50 PM (org buffers, not constants).
    expect(call.backPlan).toEqual({ packBy: '1:50 PM', leaveBy: '2:40 PM' })
    expect(call.buffers).toEqual({ pack_minutes: 50, drive_minutes: 20 })
    expect(call.venue).toEqual({ name: 'Basque Center', address: '601 W Grove St' })
    expect(call.contacts).toEqual([{ name: 'Sam', role: 'Coordinator', phone: '208-555-0000' }])
    expect(call.siteNeeds).toEqual(['power'])
    expect(call.loadout).toEqual({ checked: 1, total: 2 })
    // Day-of phases only, same filter as the run sheet itself.
    expect(call.checklists).toEqual([{ name: 'Setup', done: 1, total: 1 }])
    expect(call.fromDisplayName).toBe('BrewTrax Events')
  })

  it('propagates a rejected send — sending IS the action, nothing may report success past a throw', async () => {
    vi.mocked(sendRunSheetEmail).mockRejectedValueOnce(new Error('Email delivery failed'))
    await expect(sendRunSheet('o1', 'e1')).rejects.toThrow('Email delivery failed')
  })

  it('refuses when the caller has no member email on file', async () => {
    vi.mocked(assertEventPage).mockResolvedValue({ uid: 'member-1', role: 'staff', event_access: {} } as never)
    await expect(sendRunSheet('o1', 'e1')).rejects.toThrow(/no email/i)
    expect(sendRunSheetEmail).not.toHaveBeenCalled()
  })
})

describe('admin-gated actions', () => {
  it('instantiateOpsPlan requires org admin, not just event-page access', async () => {
    await instantiateOpsPlan('o1', 'e1', { package_ids: [], requirements: { guests: 1 }, event_start: '2026-09-01' })
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(assertEventPage).not.toHaveBeenCalled()
  })

  it('completeCloseout requires org admin, not just event-page access', async () => {
    await completeCloseout('o1', 'e1')
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(assertEventPage).not.toHaveBeenCalled()
  })
})
