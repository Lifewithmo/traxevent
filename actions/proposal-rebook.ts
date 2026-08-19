'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { listLeadsByCustomerCore, createLeadCore } from '@/lib/crm/leads'
import { listProposals, createProposal } from '@/actions/proposals'
import { updateProposalDraftCore } from '@/lib/proposals/draft-core'
import { proposalDisplayRange } from '@/lib/proposals'
import type { Lead, Proposal } from '@/lib/types'

// NOTE: 'use server' module — every export must be an async function. No type
// re-exports (a `use server` type re-export breaks `next build`). Import the
// Lead/Proposal types from '@/lib/types' at call sites; they are used here only
// for signatures.

/** Resolve when the source proposal was decided: the client's response instant,
 *  falling back to creation. */
function decidedAt(p: Proposal): number {
  return new Date(p.client_response_at ?? p.created_at).getTime()
}

/**
 * Join customer → leads → proposals and return the single newest ACCEPTED
 * proposal (with its lead) for that customer, or null when there is none.
 * Newest is by `client_response_at ?? created_at`.
 */
export async function lastAcceptedProposalForCustomer(
  orgId: string,
  customerId: string,
): Promise<{ proposal: Proposal; lead: Lead } | null> {
  await assertOrgMember(orgId)
  const leads = await listLeadsByCustomerCore(orgId, customerId)

  let best: { proposal: Proposal; lead: Lead } | null = null
  let bestTime = -Infinity
  for (const lead of leads) {
    const proposals = await listProposals(orgId, lead.id)
    for (const proposal of proposals) {
      if (proposal.status !== 'accepted') continue
      const t = decidedAt(proposal)
      if (t > bestTime) {
        bestTime = t
        best = { proposal, lead }
      }
    }
  }
  return best
}

/**
 * Re-book: seed a brand-new proposal from the customer's most recent accepted
 * proposal. A re-book is a NEW event, so this creates a FRESH open lead (seeded
 * from the source lead's guest_count/event_type and the accepted value) and a
 * fresh draft proposal that copies the source's content and pricing terms —
 * never its token/status/signature/selection/expiry. Returns the new ids for a
 * redirect into the builder, or null when there is nothing accepted to copy.
 */
export async function createProposalFromLastAccepted(
  orgId: string,
  customerId: string,
): Promise<{ proposalId: string; leadId: string } | null> {
  await assertOrgAdmin(orgId)
  const source = await lastAcceptedProposalForCustomer(orgId, customerId)
  if (!source) return null
  const { proposal, lead } = source

  // The accepted deal's realized value seeds the fresh lead; fall back to the
  // proposal's display range when a selection is somehow absent.
  const acceptedValue = proposal.selection?.selected_total ?? proposalDisplayRange(proposal).max

  const title = proposal.title ?? lead.title ?? lead.name

  // Fresh OPEN lead — a re-book starts a new inquiry, seeded from the source.
  const freshLead = await createLeadCore(orgId, {
    name: lead.name,
    stage: 'inquiry',
    customer_id: customerId,
    ...(lead.title ? { title: lead.title } : {}),
    ...(lead.email ? { email: lead.email } : {}),
    ...(lead.phone ? { phone: lead.phone } : {}),
    ...(lead.organization ? { organization: lead.organization } : {}),
    ...(lead.event_type ? { event_type: lead.event_type } : {}),
    ...(lead.guest_count != null ? { guest_count: lead.guest_count } : {}),
    ...(acceptedValue != null ? { estimated_value: acceptedValue } : {}),
  })

  // Create the draft proposal, copying scope + pricing terms verbatim. Excludes
  // token/status/signature/selection/expires_at by construction (only these
  // fields are forwarded). blocks/notes are applied by the full-state write.
  const created = await createProposal(orgId, freshLead.id, {
    title,
    line_items: proposal.line_items,
    ...(proposal.packages ? { packages: proposal.packages } : {}),
    ...(proposal.discount ? { discount: proposal.discount } : {}),
    ...(typeof proposal.tax_rate === 'number' ? { tax_rate: proposal.tax_rate } : {}),
    ...(proposal.deposit ? { deposit: proposal.deposit } : {}),
    ...(proposal.deposit_gate ? { deposit_gate: proposal.deposit_gate } : {}),
    ...(proposal.deposit_terms ? { deposit_terms: proposal.deposit_terms } : {}),
  })

  // The source's document body (blocks, or sections for the archetype layer)
  // and notes only reach the copy through a second full-state draft write.
  // Because draft-core clears absent clearable fields, re-send the full
  // state (title/pricing terms) so the org-default terms createProposal just
  // seeded are not wiped.
  const hasBody =
    (proposal.blocks?.length ?? 0) > 0 || (proposal.sections?.length ?? 0) > 0 || !!proposal.notes?.trim()
  if (hasBody) {
    await updateProposalDraftCore(orgId, created.id, {
      title,
      ...(proposal.notes ? { notes: proposal.notes } : {}),
      ...(proposal.blocks ? { blocks: proposal.blocks } : {}),
      ...(proposal.sections ? { sections: proposal.sections } : {}),
      line_items: proposal.line_items,
      ...(proposal.packages ? { packages: proposal.packages } : {}),
      ...(proposal.discount ? { discount: proposal.discount } : {}),
      ...(typeof proposal.tax_rate === 'number' ? { tax_rate: proposal.tax_rate } : {}),
      ...(proposal.deposit ? { deposit: proposal.deposit } : {}),
      ...(proposal.deposit_gate ? { deposit_gate: proposal.deposit_gate } : {}),
      ...(proposal.deposit_terms ? { deposit_terms: proposal.deposit_terms } : {}),
      ...(created.terms ? { terms: created.terms } : {}),
    })
  }

  return { proposalId: created.id, leadId: freshLead.id }
}
