import { describe, it, expect, vi, beforeEach } from 'vitest'

// Task 12: sendProposal / recordProposalView / signProposal each auto-log an
// activity event for the opportunity. Mirrors the mocking style already used
// for these two action modules (see __tests__/actions/proposals-public.test.ts
// and __tests__/actions/invoices.test.ts) — `@/lib/activity` is mocked so we
// assert on exactly what `logActivity` was called with, the same pattern
// `__tests__/actions/leads-waiting.test.ts` uses for `setLeadWaiting`.
const {
  sendProposalGetSpy, sendProposalUpdateSpy,
  voiceGetSpy, voiceSetSpy,
  collectionGroupGetSpy,
  publicProposalUpdateSpy, leadUpdateSpy,
  logActivitySpy,
} = vi.hoisted(() => ({
  sendProposalGetSpy: vi.fn(),
  sendProposalUpdateSpy: vi.fn().mockResolvedValue(undefined),
  voiceGetSpy: vi.fn().mockResolvedValue({ exists: false }),
  voiceSetSpy: vi.fn().mockResolvedValue(undefined),
  collectionGroupGetSpy: vi.fn(),
  publicProposalUpdateSpy: vi.fn().mockResolvedValue(undefined),
  leadUpdateSpy: vi.fn().mockResolvedValue(undefined),
  logActivitySpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    // findProposalByToken (actions/proposals-public.ts): collectionGroup('proposals').where(...).limit(1).get()
    collectionGroup: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: collectionGroupGetSpy,
    // sendProposal (actions/proposals.ts): collection('orgs').doc(orgId).collection('proposals'|'ai_voice').doc(...)
    collection: vi.fn().mockImplementation((top: string) => {
      if (top !== 'orgs') return {}
      return {
        doc: vi.fn().mockImplementation(() => ({
          collection: vi.fn().mockImplementation((sub: string) => {
            if (sub === 'proposals') {
              return { doc: vi.fn().mockReturnValue({ get: sendProposalGetSpy, update: sendProposalUpdateSpy }) }
            }
            if (sub === 'ai_voice') {
              return { doc: vi.fn().mockReturnValue({ get: voiceGetSpy, set: voiceSetSpy }) }
            }
            return {}
          }),
        })),
      }
    }),
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', email: 'admin@example.com' }),
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

vi.mock('@/lib/activity', () => ({ logActivity: logActivitySpy }))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (k: string) => (k === 'x-forwarded-for' ? '203.0.113.7' : k === 'user-agent' ? 'JestUA/1.0' : null),
  }),
}))
vi.mock('@/lib/email', () => ({ sendProposalSignedConfirmation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/actions/domains', () => ({ getVerifiedSendingDomain: vi.fn().mockResolvedValue(undefined) }))

import { sendProposal } from '@/actions/proposals'
import { recordProposalView, signProposal } from '@/actions/proposals-public'

beforeEach(() => {
  vi.clearAllMocks()
  sendProposalUpdateSpy.mockResolvedValue(undefined)
  voiceGetSpy.mockResolvedValue({ exists: false })
  voiceSetSpy.mockResolvedValue(undefined)
  publicProposalUpdateSpy.mockResolvedValue(undefined)
  leadUpdateSpy.mockResolvedValue(undefined)
  logActivitySpy.mockResolvedValue(undefined)
})

// Builds the collectionGroup('proposals') snapshot findProposalByToken reads,
// with a `ref` whose parent.parent is the org — mirrors
// __tests__/actions/proposals-public.test.ts's mockSnapshot helper.
function mockPublicSnapshot(data: Record<string, unknown> | null) {
  if (data === null) {
    collectionGroupGetSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  const orgRef = {
    id: (data.org_id as string) ?? 'org-1',
    collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ update: leadUpdateSpy }) }),
  }
  const ref = { update: publicProposalUpdateSpy, parent: { parent: orgRef } }
  collectionGroupGetSpy.mockResolvedValue({ empty: false, docs: [{ data: () => data, ref }] })
}

describe('sendProposal — logs a proposal-sent activity event', () => {
  it('logs kind:"proposal" with a "sent" summary after the authoritative status write', async () => {
    sendProposalGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'p1', org_id: 'org-1', lead_id: 'lead-1', title: 'Spring Wedding', status: 'draft',
        line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
        blocks: [{ id: 'b1', type: 'paragraph', text: 'Real content' }],
      }),
    })
    await sendProposal('org-1', 'p1')
    expect(sendProposalUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }))
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', {
      parent_type: 'opportunity',
      parent_id: 'lead-1',
      kind: 'proposal',
      summary: 'Proposal sent — Spring Wedding',
    })
  })

  it('falls back to "Untitled proposal" when the proposal has no title', async () => {
    sendProposalGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'draft',
        line_items: [{ id: 'i1', description: 'Cart', quantity: 1, unit_price: 500 }],
        blocks: [{ id: 'b1', type: 'paragraph', text: 'Real content' }],
      }),
    })
    await sendProposal('org-1', 'p1')
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', expect.objectContaining({
      summary: 'Proposal sent — Untitled proposal',
    }))
  })
})

describe('recordProposalView — logs only on the first portal view', () => {
  it('logs a "Proposal viewed" event on the first open', async () => {
    mockPublicSnapshot({ id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'sent' })
    await recordProposalView('tok')
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', {
      parent_type: 'opportunity', parent_id: 'lead-1', kind: 'proposal', summary: 'Proposal viewed',
    })
    expect(logActivitySpy).toHaveBeenCalledTimes(1)
  })

  it('does not log again on a later view once first_opened_at is already set', async () => {
    // First view: first_opened_at unset on the doc → logs once.
    mockPublicSnapshot({ id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'sent' })
    await recordProposalView('tok')
    expect(logActivitySpy).toHaveBeenCalledTimes(1)

    // Second view: the doc now carries first_opened_at, as it would in
    // Firestore after the first view's write persisted the stamp.
    mockPublicSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'sent',
      first_opened_at: '2026-08-15T00:00:00.000Z',
    })
    await recordProposalView('tok')
    expect(logActivitySpy).toHaveBeenCalledTimes(1) // still just the first-open log
  })

  it('does not log for a draft proposal (view is a no-op)', async () => {
    mockPublicSnapshot({ id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'draft' })
    await recordProposalView('tok')
    expect(logActivitySpy).not.toHaveBeenCalled()
  })
})

describe('signProposal — logs a proposal-signed activity event', () => {
  it('logs kind:"proposal" summary "Proposal signed" after the signature write', async () => {
    mockPublicSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'sent', line_items: [],
    })
    await signProposal('tok', { signer_name: 'Dana', signer_email: 'd@x.co', consent: true })
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', {
      parent_type: 'opportunity', parent_id: 'lead-1', kind: 'proposal', summary: 'Proposal signed',
    })
  })

  it('does not log when signing is rejected (already-signed proposal)', async () => {
    mockPublicSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', status: 'accepted', line_items: [],
      signature: { signer_name: 'X' },
    })
    await expect(
      signProposal('tok', { signer_name: 'Dana', signer_email: 'd@x.co', consent: true }),
    ).rejects.toThrow('no longer awaiting a response')
    expect(logActivitySpy).not.toHaveBeenCalled()
  })
})
