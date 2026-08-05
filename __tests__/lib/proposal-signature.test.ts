import { describe, it, expect } from 'vitest'
import { canonicalProposalDocument, documentHash, signedDocumentHash } from '@/lib/proposal-signature'
import type { Proposal, ProposalSelection } from '@/lib/types'

const base = (over: Partial<Proposal> = {}): Proposal => ({
  id: 'p', org_id: 'o', lead_id: 'l', token: 't', status: 'sent',
  title: 'Landscape', line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
  packages: [{ id: 'good', name: 'Good', includes: ['Install'], price: 12500 }],
  deposit: { type: 'percent', value: 50 }, deposit_terms: 'Non-refundable within 14 days of the event.',
  tax_rate: 8.25, created_at: '', ...over,
})
const sel: ProposalSelection = { package_id: 'good', optional_item_ids: ['o1'], selected_total: 15161.25, selected_at: '' }

describe('canonicalProposalDocument', () => {
  it('is stable regardless of object key insertion order', () => {
    const a = canonicalProposalDocument(base(), sel)
    // same data, keys built in a different order
    const reordered = base({ tax_rate: 8.25, title: 'Landscape' })
    const b = canonicalProposalDocument(reordered, { optional_item_ids: ['o1'], package_id: 'good', selected_total: 15161.25, selected_at: 'ignored' })
    expect(a).toBe(b)
  })
  it('is stable regardless of optional_item_ids order', () => {
    const s1 = { ...sel, optional_item_ids: ['a', 'b'] }
    const s2 = { ...sel, optional_item_ids: ['b', 'a'] }
    expect(canonicalProposalDocument(base(), s1)).toBe(canonicalProposalDocument(base(), s2))
  })
  it('does NOT include volatile/non-agreed fields (id, token, status, selected_at)', () => {
    expect(canonicalProposalDocument(base({ token: 'X' }), sel))
      .toBe(canonicalProposalDocument(base({ token: 'Y' }), sel))
  })
})

describe('documentHash / signedDocumentHash', () => {
  it('hashes deterministically and changes when the agreed content changes', () => {
    const h1 = signedDocumentHash(base(), sel)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(signedDocumentHash(base(), sel)).toBe(h1)              // deterministic
    expect(signedDocumentHash(base({ deposit_terms: 'Different' }), sel)).not.toBe(h1)  // content-sensitive
    expect(documentHash('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})
