import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendProposalNudgeSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const logActivitySpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getLeadSpy = vi.hoisted(() => vi.fn())
const listProposalsSpy = vi.hoisted(() => vi.fn())
const orgGetSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: () => ({ id: 'org-1', name: 'BrewTrax' }) })
)

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: orgGetSpy }) }) },
}))
vi.mock('@/lib/auth/assert', () => ({ assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }) }))
vi.mock('@/lib/activity', () => ({ logActivity: logActivitySpy }))
vi.mock('@/lib/email', () => ({ sendProposalNudge: sendProposalNudgeSpy }))
vi.mock('@/actions/leads', () => ({ getLead: getLeadSpy }))
vi.mock('@/actions/proposals', () => ({ listProposals: listProposalsSpy }))
vi.mock('@/actions/domains', () => ({ getVerifiedSendingDomain: vi.fn().mockResolvedValue(undefined) }))

import { nudgeProposal } from '@/actions/nudge'

const lead = { id: 'lead-1', name: 'Dana Kim', email: 'dana@example.com', stage: 'proposal', created_at: '' }
const unopenedProposal = {
  id: 'p1', token: 'tok', title: 'Cold brew bar', status: 'sent',
  sent_at: '2026-08-01T00:00:00.000Z', events: [], created_at: '',
}

describe('nudgeProposal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendProposalNudgeSpy.mockResolvedValue(undefined)
    getLeadSpy.mockResolvedValue(lead)
    listProposalsSpy.mockResolvedValue([unopenedProposal])
  })

  it('sends the nudge and logs the activity', async () => {
    await nudgeProposal('org-1', 'lead-1')

    expect(sendProposalNudgeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'dana@example.com', contactName: 'Dana Kim', token: 'tok' })
    )
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', expect.objectContaining({ kind: 'nudge' }))
  })

  // The load-bearing one. sendProposalNudge now throws on a rejected send, and here the
  // send IS the action — so the failure must reach the operator AND must not leave an
  // activity entry claiming a reminder went out. Before delivery detection existed, a
  // Resend error resolved silently and this timeline entry was written anyway.
  it('does not log the activity when the send fails, and surfaces the error', async () => {
    sendProposalNudgeSpy.mockRejectedValueOnce(new Error('Invalid `to` field.'))

    await expect(nudgeProposal('org-1', 'lead-1')).rejects.toThrow(/invalid `to` field/i)

    expect(logActivitySpy).not.toHaveBeenCalled()
  })

  it('rejects a lead with no email before attempting a send', async () => {
    getLeadSpy.mockResolvedValue({ ...lead, email: undefined })

    await expect(nudgeProposal('org-1', 'lead-1')).rejects.toThrow(/no email/i)

    expect(sendProposalNudgeSpy).not.toHaveBeenCalled()
    expect(logActivitySpy).not.toHaveBeenCalled()
  })

  it('rejects when there is no unopened sent proposal', async () => {
    listProposalsSpy.mockResolvedValue([])

    await expect(nudgeProposal('org-1', 'lead-1')).rejects.toThrow(/no unopened sent proposal/i)

    expect(sendProposalNudgeSpy).not.toHaveBeenCalled()
  })
})
