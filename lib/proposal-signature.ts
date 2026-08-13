import { createHash } from 'node:crypto'
import type { Proposal, ProposalSelection } from '@/lib/types'

// Recursively sort object keys so equivalent documents serialize identically.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonicalize(obj[k])
      return acc
    }, {})
  }
  return value
}

type SignableProposal = Pick<Proposal, 'title' | 'notes' | 'packages' | 'line_items' | 'discount' | 'tax_rate' | 'deposit' | 'deposit_terms' | 'terms'>
type SignableSelection = Pick<ProposalSelection, 'package_id' | 'optional_item_ids' | 'selected_total'>

// A canonical serialization of EXACTLY what the customer agreed to — scope,
// selection, pricing, and terms. Deliberately excludes volatile/non-agreed
// fields (id, token, status, timestamps).
//
// Pricing model v2 note: packages and line_items are serialized as stored, so
// the v2 fields (unit, item_ids, price_override) participate in the hash
// exactly when PRESENT and serialize nothing when absent. Signed legacy
// documents therefore keep producing their original digests — pinned forever
// by __tests__/lib/proposal-signature-goldens.test.ts (fixtures generated
// from this file at main/5fa2230, pre-v2; never regenerate them to make a
// failure pass).
export function canonicalProposalDocument(proposal: Proposal | SignableProposal, selection: ProposalSelection | SignableSelection): string {
  const doc = {
    title: proposal.title ?? null,
    notes: proposal.notes ?? null,
    packages: proposal.packages ?? [],
    line_items: proposal.line_items ?? [],
    discount: proposal.discount ?? null,
    tax_rate: proposal.tax_rate ?? null,
    deposit: proposal.deposit ?? null,
    deposit_terms: proposal.deposit_terms ?? null,
    ...(proposal.terms !== undefined ? { terms: proposal.terms } : {}),
    selection: {
      package_id: selection.package_id ?? null,
      optional_item_ids: [...(selection.optional_item_ids ?? [])].sort(),
      selected_total: selection.selected_total,
    },
  }
  return JSON.stringify(canonicalize(doc))
}

export function documentHash(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex')
}

export function signedDocumentHash(proposal: Proposal | SignableProposal, selection: ProposalSelection | SignableSelection): string {
  return documentHash(canonicalProposalDocument(proposal, selection))
}
