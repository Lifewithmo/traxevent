import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Lead, Proposal } from '@/lib/types'

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({}),
  assertOrgAdmin: vi.fn().mockResolvedValue({}),
}))

const listLeadsByCustomerCoreSpy = vi.hoisted(() => vi.fn())
const createLeadCoreSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/crm/leads', () => ({
  listLeadsByCustomerCore: listLeadsByCustomerCoreSpy,
  createLeadCore: createLeadCoreSpy,
}))

const listProposalsSpy = vi.hoisted(() => vi.fn())
const createProposalSpy = vi.hoisted(() => vi.fn())
vi.mock('@/actions/proposals', () => ({
  listProposals: listProposalsSpy,
  createProposal: createProposalSpy,
}))

const updateDraftCoreSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ proposal: { id: 'new-p' }, adjustments: [] })
)
vi.mock('@/lib/proposals/draft-core', () => ({ updateProposalDraftCore: updateDraftCoreSpy }))

import {
  lastAcceptedProposalForCustomer,
  createProposalFromLastAccepted,
} from '@/actions/proposal-rebook'
import { assertOrgAdmin, assertOrgMember } from '@/lib/auth/assert'

// ── Fixtures ───────────────────────────────────────────────────────────────

const leadL1: Lead = {
  id: 'l1',
  name: 'Acme Co',
  stage: 'closed_won',
  customer_id: 'c1',
  guest_count: 120,
  event_type: 'Gala',
  estimated_value: 5000,
  created_at: '2025-01-01T00:00:00.000Z',
}
const leadL2: Lead = {
  id: 'l2',
  name: 'Acme Co',
  title: 'Holiday Party',
  stage: 'closed_won',
  customer_id: 'c1',
  guest_count: 150,
  event_type: 'Holiday',
  estimated_value: 6000,
  created_at: '2026-01-01T00:00:00.000Z',
}

const lineItems = [
  { id: 'li1', description: 'Espresso bar', quantity: 1, unit_price: 500 },
  { id: 'li2', description: 'Add-on', quantity: 1, unit_price: 200, optional: true },
]
const packages = [
  { id: 'pk1', name: 'Good', includes: [], price: 700, item_ids: ['li1', 'li2'] },
]

function makeProposal(over: Partial<Proposal>): Proposal {
  return {
    id: 'p?',
    org_id: 'o1',
    lead_id: 'l1',
    token: 'tok',
    status: 'accepted',
    line_items: lineItems,
    created_at: '2025-01-05T00:00:00.000Z',
    ...over,
  }
}

// Older accepted proposal on L1
const propOld = makeProposal({
  id: 'p-old',
  lead_id: 'l1',
  status: 'accepted',
  client_response_at: '2025-02-01T00:00:00.000Z',
  selection: { optional_item_ids: [], selected_total: 8000, selected_at: '2025-02-01T00:00:00.000Z' },
  packages,
  discount: { type: 'percent', value: 10 },
  tax_rate: 8.25,
  deposit: { type: 'percent', value: 25 },
  deposit_gate: 'before_accept',
  deposit_terms: 'Half up front',
  title: 'Old Gala Proposal',
  notes: 'Prior notes',
  blocks: [{ id: 'b1', type: 'paragraph', text: 'Hello' }],
})
// Newer accepted proposal on L2 — should win
const propNew = makeProposal({
  id: 'p-new',
  lead_id: 'l2',
  status: 'accepted',
  client_response_at: '2026-03-01T00:00:00.000Z',
  selection: { optional_item_ids: [], selected_total: 9000, selected_at: '2026-03-01T00:00:00.000Z' },
  packages,
  title: 'Holiday Proposal',
})
// A draft on L2 that must be ignored
const propDraft = makeProposal({ id: 'p-draft', lead_id: 'l2', status: 'draft', client_response_at: undefined })

function wireStandard() {
  listLeadsByCustomerCoreSpy.mockResolvedValue([leadL2, leadL1])
  listProposalsSpy.mockImplementation(async (_org: string, leadId: string) => {
    if (leadId === 'l1') return [propOld]
    if (leadId === 'l2') return [propNew, propDraft]
    return []
  })
  createLeadCoreSpy.mockResolvedValue({ ...leadL2, id: 'fresh-lead' })
  createProposalSpy.mockResolvedValue({ id: 'new-p', terms: 'Org default terms' } as Proposal)
}

describe('lastAcceptedProposalForCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wireStandard()
  })

  it('picks the newest accepted proposal across the customer’s leads', async () => {
    const res = await lastAcceptedProposalForCustomer('o1', 'c1')
    expect(assertOrgMember).toHaveBeenCalledWith('o1')
    expect(res?.proposal.id).toBe('p-new')
    expect(res?.lead.id).toBe('l2')
  })

  it('ignores non-accepted proposals', async () => {
    listLeadsByCustomerCoreSpy.mockResolvedValue([leadL2])
    listProposalsSpy.mockResolvedValue([propDraft])
    const res = await lastAcceptedProposalForCustomer('o1', 'c1')
    expect(res).toBeNull()
  })

  it('returns null when the customer has no leads', async () => {
    listLeadsByCustomerCoreSpy.mockResolvedValue([])
    const res = await lastAcceptedProposalForCustomer('o1', 'c1')
    expect(res).toBeNull()
  })

  it('orders by created_at when client_response_at is absent', async () => {
    const a = makeProposal({ id: 'a', lead_id: 'l1', status: 'accepted', client_response_at: undefined, created_at: '2025-05-01T00:00:00.000Z' })
    const b = makeProposal({ id: 'b', lead_id: 'l2', status: 'accepted', client_response_at: undefined, created_at: '2025-09-01T00:00:00.000Z' })
    listLeadsByCustomerCoreSpy.mockResolvedValue([leadL1, leadL2])
    listProposalsSpy.mockImplementation(async (_o: string, leadId: string) => (leadId === 'l1' ? [a] : [b]))
    const res = await lastAcceptedProposalForCustomer('o1', 'c1')
    expect(res?.proposal.id).toBe('b')
  })
})

describe('createProposalFromLastAccepted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wireStandard()
  })

  it('asserts admin and returns null when there is no accepted proposal', async () => {
    listProposalsSpy.mockResolvedValue([])
    const res = await createProposalFromLastAccepted('o1', 'c1')
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(res).toBeNull()
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
    expect(createProposalSpy).not.toHaveBeenCalled()
  })

  it('creates a FRESH lead seeded from the source lead + accepted value', async () => {
    await createProposalFromLastAccepted('o1', 'c1')
    expect(createLeadCoreSpy).toHaveBeenCalledTimes(1)
    const [org, leadInput] = createLeadCoreSpy.mock.calls[0]
    expect(org).toBe('o1')
    expect(leadInput.customer_id).toBe('c1')
    expect(leadInput.guest_count).toBe(150) // from source lead L2
    expect(leadInput.event_type).toBe('Holiday')
    expect(leadInput.estimated_value).toBe(9000) // from accepted proposal selection
    // fresh lead is a new OPEN lead, not a copy of the closed one
    expect(['inquiry', 'consultation', 'proposal']).toContain(leadInput.stage)
  })

  it('seeds a proposal copying line_items + packages + pricing terms verbatim', async () => {
    await createProposalFromLastAccepted('o1', 'c1')
    expect(createProposalSpy).toHaveBeenCalledTimes(1)
    const [org, freshLeadId, input] = createProposalSpy.mock.calls[0]
    expect(org).toBe('o1')
    expect(freshLeadId).toBe('fresh-lead')
    expect(input.line_items).toEqual(propNew.line_items)
    expect(input.packages).toEqual(propNew.packages)
    expect(input.title).toBe('Holiday Proposal')
  })

  it('excludes token/status/signature/selection/expires_at from the copy', async () => {
    await createProposalFromLastAccepted('o1', 'c1')
    const [, , input] = createProposalSpy.mock.calls[0]
    expect(input).not.toHaveProperty('token')
    expect(input).not.toHaveProperty('status')
    expect(input).not.toHaveProperty('signature')
    expect(input).not.toHaveProperty('selection')
    expect(input).not.toHaveProperty('expires_at')
  })

  it('does a second full-state draft write when the source has blocks/notes', async () => {
    // source is propOld (make it the only/newest accepted)
    listLeadsByCustomerCoreSpy.mockResolvedValue([leadL1])
    listProposalsSpy.mockResolvedValue([propOld])
    createLeadCoreSpy.mockResolvedValue({ ...leadL1, id: 'fresh-lead' })
    await createProposalFromLastAccepted('o1', 'c1')
    expect(updateDraftCoreSpy).toHaveBeenCalledTimes(1)
    const [org, proposalId, draft] = updateDraftCoreSpy.mock.calls[0]
    expect(org).toBe('o1')
    expect(proposalId).toBe('new-p')
    expect(draft.blocks).toEqual(propOld.blocks)
    expect(draft.notes).toBe('Prior notes')
    expect(draft.line_items).toEqual(propOld.line_items)
    // terms re-sent so the full-state write does not clear the seeded default
    expect(draft.terms).toBe('Org default terms')
    // never copy the accepted selection or expiry
    expect(draft).not.toHaveProperty('selection')
    expect(draft).not.toHaveProperty('expires_at')
  })

  it('skips the second draft write when the source has no blocks/notes', async () => {
    // propNew has neither blocks nor notes
    await createProposalFromLastAccepted('o1', 'c1')
    expect(updateDraftCoreSpy).not.toHaveBeenCalled()
  })

  it('returns the new proposal + fresh lead ids for redirect', async () => {
    const res = await createProposalFromLastAccepted('o1', 'c1')
    expect(res).toEqual({ proposalId: 'new-p', leadId: 'fresh-lead' })
  })
})
