import { proposalRange, proposalExpiryInstant } from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

export type SendGateCheck = 'no_price' | 'placeholders' | 'expired' | 'empty_document'

export const SEND_GATE_MESSAGES: Record<SendGateCheck, string> = {
  no_price: 'This proposal has no price — add a line item or a package.',
  placeholders: 'Some sections are still placeholders. They are hidden from the customer, so the document would arrive with holes.',
  expired: 'The expiry date has already passed — the customer could not accept this.',
  empty_document: 'There is nothing for the customer to read yet.',
}

type GateInput = Pick<Proposal, 'line_items' | 'blocks' | 'packages' | 'expires_at'>

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

  const blocks = p.blocks ?? []
  if (blocks.some((b) => b.placeholder === true)) failed.push('placeholders')

  // The customer never sees placeholder blocks (ProposalDocument strips them),
  // so "empty" must be judged on what actually ships.
  if (blocks.filter((b) => b.placeholder !== true).length === 0) failed.push('empty_document')

  // proposalExpiryInstant already returns epoch milliseconds (Infinity for an
  // unparseable date, which must never read as expired) — compare directly.
  if (p.expires_at && now.getTime() > proposalExpiryInstant(p.expires_at)) {
    failed.push('expired')
  }

  return failed
}
