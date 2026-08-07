'use server'

// ============================================================================
// TEMPORARY TRACK-C STUB ACTION — DELETE AT INTEGRATION
//
// Minimal stand-in for Track A's consolidated `updateProposalDraft` (spec §5)
// so the Track C builder is runnable and testable standalone. Track A's real
// action replaces `updateProposal` + `updateProposalBlocks` with a guard-free
// core + guarded action per the house pattern; this stub only implements the
// contract surface the builder needs:
//   - signed / pending-signature / voided guards
//   - block normalization that PRESERVES `placeholder: true` blocks verbatim
//     (so skeleton instructions and empty image slots survive autosave)
//   - composed-package validation (item_ids resolve, no dup refs, ≤3 tiers)
//   - denormalized `price` recompute (Σ members, price_override wins)
//   - cleared optional fields map to FieldValue.delete()
//   - returns the persisted draft so the client re-seeds from server truth
//
// NOTE: types deliberately NOT re-exported here — re-exporting a type from a
// 'use server' module breaks `next build` (see project memory).
// ============================================================================

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { assertOrgAdmin } from '@/lib/auth/assert'
import { normalizeBlocks } from '@/lib/proposals/blocks'
import {
  packagePrice,
  type PlaceholderBlock,
  type ProposalDraftUpdate,
  type ProposalLineItem,
  type ProposalPackage,
} from '@/lib/proposal-builder-stubs'
import type { Proposal, ProposalBlock } from '@/lib/types'

export interface DraftSaveResult {
  draft: ProposalDraftUpdate
  adjustments: string[]
}

// Placeholder blocks pass through verbatim: they are builder-authored
// constants (or unchanged persisted state), and normalizeBlocks would drop an
// empty image slot or rewrite instruction text length. Everything else goes
// through the standard normalization.
function normalizeDraftBlocks(
  input: PlaceholderBlock[],
): { blocks: PlaceholderBlock[]; adjustments: string[] } {
  const nonPlaceholder = input.filter((b) => b.placeholder !== true)
  const { blocks: normalized, adjustments } = normalizeBlocks(nonPlaceholder)
  const byId = new Map(normalized.map((b) => [b.id, b]))
  const blocks: PlaceholderBlock[] = []
  for (const original of input) {
    if (original.placeholder === true) {
      blocks.push(original)
      continue
    }
    const kept = byId.get(original.id)
    if (kept) {
      blocks.push(kept as PlaceholderBlock)
      byId.delete(original.id)
    }
  }
  // Blocks normalizeBlocks re-minted under a new id (blank/duplicate ids)
  // would be orphaned by the id-match above; append them so nothing the
  // normalizer kept is silently lost.
  for (const leftover of byId.values()) blocks.push(leftover as PlaceholderBlock)
  return { blocks, adjustments }
}

function validatePackages(
  packages: ProposalPackage[],
  lineItems: ProposalLineItem[],
): { packages: ProposalPackage[]; adjustments: string[] } {
  if (packages.length > 3) throw new Error('A proposal can offer at most 3 packages')
  const adjustments: string[] = []
  const poolIds = new Set(lineItems.filter((i) => i.id).map((i) => i.id as string))
  const kept: ProposalPackage[] = []
  for (const pkg of packages) {
    if (!pkg.item_ids) {
      kept.push(pkg) // legacy: authoritative as stored, read-only
      continue
    }
    if (pkg.item_ids.some((id) => !poolIds.has(id))) {
      adjustments.push(`Dropped package "${pkg.name}" — it references a line item that no longer exists.`)
      continue
    }
    if (new Set(pkg.item_ids).size !== pkg.item_ids.length) {
      adjustments.push(`Dropped package "${pkg.name}" — it lists the same line item twice.`)
      continue
    }
    kept.push({ ...pkg, price: packagePrice(pkg, lineItems) })
  }
  return { packages: kept, adjustments }
}

export async function updateProposalDraft(
  orgId: string,
  proposalId: string,
  draft: ProposalDraftUpdate,
): Promise<DraftSaveResult> {
  await assertOrgAdmin(orgId)

  const ref = adminDb.collection('orgs').doc(orgId).collection('proposals').doc(proposalId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Proposal not found')
  const data = snap.data() as Proposal
  if (data.signature || data.pending_signature) {
    throw new Error('This proposal is signed and can no longer be edited')
  }
  if (data.status === 'voided') {
    throw new Error('This proposal is voided and can no longer be edited')
  }

  const adjustments: string[] = []
  const persisted: ProposalDraftUpdate = { ...draft }

  if (draft.blocks !== undefined) {
    const res = normalizeDraftBlocks(draft.blocks)
    persisted.blocks = res.blocks
    adjustments.push(...res.adjustments)
  }

  if (draft.packages !== undefined) {
    const pool = draft.line_items ?? (data.line_items as ProposalLineItem[] | undefined) ?? []
    const res = validatePackages(draft.packages, pool)
    persisted.packages = res.packages
    adjustments.push(...res.adjustments)
  }

  // The builder always sends its full draft state, so an explicitly-undefined
  // key means "the user cleared this field" — same convention as the old
  // updateProposal action.
  const write: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(persisted)) {
    write[k] = v === undefined ? FieldValue.delete() : v
  }
  // `blocks` may hold placeholder flags; Firestore stores them as plain data.
  await ref.update({ ...write, updated_at: new Date().toISOString() })

  // Return the persisted draft (cleared fields stay undefined/omitted) so the
  // client can re-seed without lying about what was stored.
  const echoed: ProposalDraftUpdate = {}
  for (const [k, v] of Object.entries(persisted)) {
    if (v !== undefined) (echoed as Record<string, unknown>)[k] = v
  }
  if (persisted.blocks !== undefined) echoed.blocks = persisted.blocks as ProposalBlock[]
  return { draft: echoed, adjustments }
}
