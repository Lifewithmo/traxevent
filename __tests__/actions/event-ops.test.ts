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
  sendRunSheetCore: vi.fn().mockResolvedValue({ to: 'op@demo.co' }),
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

import { assertOrgAdmin, assertEventPage } from '@/lib/auth/assert'
import { recomputeOpsListsCore, bulkSetListCheckedCore, confirmReadyCore, sendRunSheetCore } from '@/lib/ops/event-ops'
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

describe('sendRunSheet (inc-2 S3.3 — self-send v1; render+send extracted to sendRunSheetCore inc-3 B5)', () => {
  // The inline-content behavior (anchor, org-buffer back-plan, day-of checklist
  // filter, load status) is covered on the CORE in
  // __tests__/lib/ops/send-run-sheet-core.test.ts — the action contributes only
  // the gate and the recipient identity.
  beforeEach(() => {
    vi.mocked(assertEventPage).mockResolvedValue({
      uid: 'member-1', role: 'staff', email: 'op@demo.co', event_access: {},
    } as never)
  })

  it('gates on the ops grant and passes the CALLER\'s own member email to the core', async () => {
    const result = await sendRunSheet('o1', 'e1')
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
    expect(sendRunSheetCore).toHaveBeenCalledWith('o1', 'e1', { email: 'op@demo.co' })
    expect(result).toEqual({ to: 'op@demo.co' })
  })

  it('propagates a rejected send — sending IS the action, nothing may report success past a throw', async () => {
    vi.mocked(sendRunSheetCore).mockRejectedValueOnce(new Error('Email delivery failed'))
    await expect(sendRunSheet('o1', 'e1')).rejects.toThrow('Email delivery failed')
  })

  it('refuses when the caller has no member email on file', async () => {
    vi.mocked(assertEventPage).mockResolvedValue({ uid: 'member-1', role: 'staff', event_access: {} } as never)
    await expect(sendRunSheet('o1', 'e1')).rejects.toThrow(/no email/i)
    expect(sendRunSheetCore).not.toHaveBeenCalled()
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
