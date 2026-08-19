import { proposalRange, proposalExpiryInstant } from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

export type SendGateCheck = 'no_price' | 'placeholders' | 'expired' | 'empty_document'

export const SEND_GATE_MESSAGES: Record<SendGateCheck, string> = {
  no_price: 'This proposal has no price — add a line item or a package.',
  placeholders: 'Some sections are still placeholders. They are hidden from the customer, so the document would arrive with holes.',
  expired: 'The expiry date has already passed — the customer could not accept this.',
  empty_document: 'There is nothing for the customer to read yet.',
}

type GateInput = Pick<Proposal, 'line_items' | 'blocks' | 'sections' | 'packages' | 'expires_at'>

/**
 * The blocking craft checks, all computable from the proposal document with no
 * schema change (spec §12).
 *
 * Deliberately NOT checked here: hero contrast (made unfailable by the fixed
 * scrim constant), measure/widows (guaranteed by the layout system, not
 * detectable from data), and image resolution (no dimensions are captured, so
 * a check that passes on `undefined` for the entire existing corpus is theater).
 */
export function evaluateSendGate(p: GateInput, now: Date): SendGateCheck[] {
  const failed: SendGateCheck[] = []

  const range = proposalRange({
    packages: p.packages,
    line_items: p.line_items ?? [],
  })
  if (range.max <= 0) failed.push('no_price')

  // Content lives in EITHER the legacy `blocks` array OR the archetype
  // layer's `sections[].blocks` (never both — sectionsFromProposal only
  // projects `blocks` into a section when `sections` is absent). Reading
  // only `p.blocks` made this gate blind to a sections-authored proposal:
  // `empty_document` would fire on a full document, and a section-level
  // `placeholder: true` (an authored section skipped on public/print, see
  // ProposalSection's type comment) would pass unchecked because it carries
  // no per-block placeholder flags of its own.
  const blocks = p.blocks ?? []
  const sections = p.sections ?? []
  const sectionBlocks = sections.flatMap((s) => s.blocks ?? [])
  const allBlocks = [...blocks, ...sectionBlocks]
  const anyPlaceholderSection = sections.some((s) => s.placeholder === true)

  if (allBlocks.some((b) => b.placeholder === true) || anyPlaceholderSection) {
    failed.push('placeholders')
  }

  // The customer never sees placeholder blocks (ProposalDocument strips
  // them), so "empty" must be judged on what actually ships. Derived
  // sections (tiers/add_ons/investment/accept/terms) never carry blocks —
  // same as before this fix, they don't count as "content" here, matching
  // the legacy blocks-only check's intent (price/accept are covered by
  // `no_price`, not `empty_document`).
  if (allBlocks.filter((b) => b.placeholder !== true).length === 0) failed.push('empty_document')

  // proposalExpiryInstant already returns epoch milliseconds (Infinity for an
  // unparseable date, which must never read as expired) — compare directly.
  if (p.expires_at && now.getTime() > proposalExpiryInstant(p.expires_at)) {
    failed.push('expired')
  }

  return failed
}
