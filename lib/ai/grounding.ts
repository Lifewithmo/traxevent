// Pure prompt builders — NO backend/DB imports, mirroring lib/ops/derive.ts.
// Callers fetch the data (listWorkPackagesCore/listResourcesCore); these
// functions only turn it into deterministic, cache-stable prompt text.
import type { WorkPackage, OpsResource } from '@/lib/types'

// Deterministic (sorted by id) so the rendered prompt bytes are identical
// across requests for the same catalog — prompt caching is a prefix match,
// and any byte change invalidates everything after it.
export function serializeCatalog(packages: WorkPackage[], resources: OpsResource[]): string {
  const pkgLines = [...packages]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => {
      const parts = [
        `- id: ${p.id} | name: ${p.name} | price: $${p.price}`,
        p.max_guests !== undefined ? `max_guests: ${p.max_guests}` : null,
        p.description ? `description: ${p.description}` : null,
        p.scope ? `scope: ${p.scope}` : null,
      ].filter(Boolean)
      return parts.join(' | ')
    })
  const resLines = [...resources]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) =>
      [`- id: ${r.id} | name: ${r.name} | kind: ${r.kind}`, r.unit ? `unit: ${r.unit}` : null]
        .filter(Boolean)
        .join(' | '),
    )
  return [
    '## Work packages',
    pkgLines.length ? pkgLines.join('\n') : '(no packages defined)',
    '',
    '## Resources',
    resLines.length ? resLines.join('\n') : '(no resources defined)',
  ].join('\n')
}

const DRAFT_SYSTEM_PROMPT = `You draft proposal documents for a booked-job business (events, mobile beverage service, and similar). You write on behalf of the business owner, addressed to their customer.

You are given the org's real catalog of work packages and resources, plus the operator's raw notes about this opportunity. Produce a customer-facing proposal document as structured blocks.

Rules you may not break:
- NEVER invent prices, discounts, legal terms, or scope not present in the notes or catalog. Prices live in the catalog and the proposal's pricing section — not in your document text.
- When notes align with the catalog, propose up to 3 suggested_packages, each composed of line items (description, quantity, unit_price; optional: true for customer-toggleable add-ons). Every unit_price must come from the catalog or the operator's notes — when neither states a price, use 0 and let the operator fill it in. Never write package prices into blocks.
- Write in clear, warm, professional prose. No placeholder text, no "[insert X]".
- rationale is one paragraph addressed to the OPERATOR (not the customer) explaining your drafting choices.`

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export function buildDraftSystemBlocks(catalogText: string): SystemBlock[] {
  return [
    { type: 'text', text: DRAFT_SYSTEM_PROMPT },
    // cache_control on the LAST stable block: system prompt + catalog cache
    // together; the per-request notes go in the user message after this.
    { type: 'text', text: `# Org catalog (ground truth)\n\n${catalogText}`, cache_control: { type: 'ephemeral' } },
  ]
}
