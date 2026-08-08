import { describe, it, expect } from 'vitest'
import { canonicalProposalDocument, documentHash } from '@/lib/proposal-signature'
import goldens from '@/__tests__/fixtures/proposal-signature-goldens.json'

// §9 hash goldens: the fixture file was generated from lib/proposal-signature.ts
// AT main (commit 5fa2230), BEFORE pricing model v2 touched the proposal types.
// Signed documents are immutable — if any golden here changes, a signed
// proposal's stored document_hash would no longer verify against its own
// content. These fixtures must never be regenerated to make a failure pass;
// a failure means the canonicalization change is wrong.
//
// The fixtures deliberately include v2-shaped packages (item_ids,
// price_override, unit) hashed through the PRE-change code: canonicalize()
// passes through whatever fields are present, so present-field serialization
// must be byte-identical before and after the model change, and absent fields
// must keep serializing exactly as today.
describe('proposal-signature hash goldens (pre-v2 fixtures)', () => {
  for (const g of goldens) {
    it(`canonical form and digest are bit-stable: ${g.name}`, () => {
      const canonical = canonicalProposalDocument(g.proposal as never, g.selection as never)
      expect(canonical).toBe(g.canonical)
      expect(documentHash(canonical)).toBe(g.hash)
    })
  }
})
