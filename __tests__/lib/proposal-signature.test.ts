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

  // canonicalize() sorts object keys recursively but preserves array element
  // ORDER. This proves it also reaches inside array elements — a nested
  // object's keys being built in a different order (e.g. one line item
  // literal vs. another with the same fields typed in a different sequence)
  // must not change the hash, since JSON.stringify is key-order-sensitive
  // per object unless every nested object has first been canonicalized.
  it('is stable regardless of nested-object key order WITHIN an array element (line_items, packages)', () => {
    const a = base({
      line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
      packages: [{ id: 'good', name: 'Good', includes: ['Install'], price: 12500 }],
    })
    const b = base({
      // same line item and package, same values — keys assembled in a
      // different order for each nested object inside the array
      line_items: [{ optional: true, unit_price: 1500, id: 'o1', quantity: 1, description: 'Lighting' }],
      packages: [{ price: 12500, includes: ['Install'], id: 'good', name: 'Good' }],
    })
    expect(canonicalProposalDocument(a, sel)).toBe(canonicalProposalDocument(b, sel))
    expect(signedDocumentHash(a, sel)).toBe(signedDocumentHash(b, sel))
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

// Pricing model v2: canonicalize() serializes whatever fields are PRESENT, so
// unit / item_ids / price_override participate in the hash exactly when
// present — they are agreed content — while their absence keeps legacy
// documents serializing byte-identically (pinned by the goldens file).
describe('v2 composed-package field sensitivity', () => {
  const composed = (over: Partial<Proposal> = {}): Proposal =>
    base({
      line_items: [
        { id: 'i1', description: 'Setup', quantity: 1, unit_price: 500, unit: 'each' },
        { id: 'i2', description: 'Service', quantity: 8, unit_price: 120, unit: 'hr' },
      ],
      packages: [{ id: 'p1', name: 'Standard', includes: [], price: 1460, item_ids: ['i1', 'i2'] }],
      ...over,
    })
  const csel: ProposalSelection = { package_id: 'p1', optional_item_ids: [], selected_total: 1460, selected_at: '' }

  it('changes when price_override is set', () => {
    const withOverride = composed({
      packages: [{ id: 'p1', name: 'Standard', includes: [], price: 1400, item_ids: ['i1', 'i2'], price_override: 1400 }],
    })
    expect(signedDocumentHash(withOverride, csel)).not.toBe(signedDocumentHash(composed(), csel))
  })

  it('changes when item_ids order changes (bullets ARE the member order)', () => {
    const reordered = composed({
      packages: [{ id: 'p1', name: 'Standard', includes: [], price: 1460, item_ids: ['i2', 'i1'] }],
    })
    expect(signedDocumentHash(reordered, csel)).not.toBe(signedDocumentHash(composed(), csel))
  })

  it('changes when a member item unit changes', () => {
    const differentUnit = composed({
      line_items: [
        { id: 'i1', description: 'Setup', quantity: 1, unit_price: 500, unit: 'day' },
        { id: 'i2', description: 'Service', quantity: 8, unit_price: 120, unit: 'hr' },
      ],
    })
    expect(signedDocumentHash(differentUnit, csel)).not.toBe(signedDocumentHash(composed(), csel))
  })
})
