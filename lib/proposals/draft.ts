import { normalizeBlocks } from '@/lib/proposals/blocks'
import { isComposedPackage, packagePrice } from '@/lib/proposals'
import type {
  Proposal,
  ProposalBlock,
  ProposalDeposit,
  ProposalDiscount,
  ProposalLineItem,
  ProposalPackage,
} from '@/lib/types'

export const MAX_PACKAGES = 3

// The builder's typed client-side draft state — structurally assignable to
// ProposalDraftInput (whose content fields are `unknown` because they accept
// untrusted input; this is the shape the builder actually holds).
export interface ProposalDraftUpdate {
  title?: string
  notes?: string
  blocks?: ProposalBlock[]
  line_items?: ProposalLineItem[]
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
  expires_at?: string
}

// Projects a persisted Proposal back down to the draft fields the builder
// edits — used to re-seed editor state from updateProposalDraft's response
// so the client never lies about what was stored.
export function draftFromProposal(p: Proposal): ProposalDraftUpdate {
  const draft: ProposalDraftUpdate = {}
  if (p.title !== undefined) draft.title = p.title
  if (p.notes !== undefined) draft.notes = p.notes
  if (p.blocks !== undefined) draft.blocks = p.blocks
  if (p.line_items !== undefined) draft.line_items = p.line_items
  if (p.packages !== undefined) draft.packages = p.packages
  if (p.discount !== undefined) draft.discount = p.discount
  if (p.tax_rate !== undefined) draft.tax_rate = p.tax_rate
  if (p.deposit !== undefined) draft.deposit = p.deposit
  if (p.deposit_gate !== undefined) draft.deposit_gate = p.deposit_gate
  if (p.deposit_terms !== undefined) draft.deposit_terms = p.deposit_terms
  if (p.expires_at !== undefined) draft.expires_at = p.expires_at
  return draft
}

// Structural violations — a client bug, not user content to clean up. These
// reject the whole write; content problems (empty descriptions, bad numbers)
// are instead dropped with a reported adjustment, matching normalizeBlocks.
export class ProposalDraftError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProposalDraftError'
  }
}

// The FULL editable state of a draft in one payload (spec §5): the builder
// autosaves everything it edits through this one shape. Absent optional
// field = the user cleared it — never "leave unchanged".
export interface ProposalDraftInput {
  title?: string
  notes?: string
  blocks?: unknown
  line_items?: unknown
  packages?: unknown
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  expires_at?: string
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
}

export interface NormalizedProposalDraft {
  title?: string
  notes?: string
  blocks: ProposalBlock[]
  line_items: ProposalLineItem[]
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  expires_at?: string
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function normalizeMoneyRule(v: unknown): ProposalDiscount | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  if (r.type !== 'percent' && r.type !== 'fixed') return undefined
  if (!finite(r.value) || !(r.value > 0)) return undefined
  return { type: r.type, value: r.value }
}

function normalizeLineItems(input: unknown, adjustments: string[]): ProposalLineItem[] {
  if (!Array.isArray(input)) return []
  const items: ProposalLineItem[] = []
  const seen = new Set<string>()

  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      adjustments.push('Dropped an unreadable line item.')
      return
    }
    const r = raw as Record<string, unknown>
    const description = str(r.description).trim()
    if (!description) {
      adjustments.push('Dropped a line item with no description.')
      return
    }
    if (!finite(r.quantity) || !finite(r.unit_price)) {
      adjustments.push(`Dropped "${description}" — quantity and unit price must be numbers.`)
      return
    }

    // Ids anchor package refs and customer selections, so every persisted
    // item gets one. First claim on an id wins; a later duplicate is
    // re-minted (and reported) so package refs stay unambiguous.
    let id = str(r.id).trim()
    if (id && seen.has(id)) {
      adjustments.push(`Renamed a duplicate line item id ("${id}").`)
      id = ''
    }
    if (!id) {
      let n = index
      while (seen.has(`item-${n}`)) n += 1
      id = `item-${n}`
    }
    seen.add(id)

    const unit = str(r.unit).trim()
    items.push({
      id,
      description,
      quantity: r.quantity,
      unit_price: r.unit_price,
      ...(unit ? { unit } : {}),
      ...(typeof r.optional === 'boolean' ? { optional: r.optional } : {}),
      ...(typeof r.taxable === 'boolean' ? { taxable: r.taxable } : {}),
    })
  })

  return items
}

function normalizePackages(
  input: unknown,
  pool: ProposalLineItem[],
  adjustments: string[],
): ProposalPackage[] | undefined {
  if (!Array.isArray(input)) return undefined
  if (input.length > MAX_PACKAGES) {
    throw new ProposalDraftError(`A proposal can offer at most ${MAX_PACKAGES} packages`)
  }
  const poolIds = new Set(pool.filter((i) => i.id !== undefined).map((i) => i.id as string))
  const seen = new Set<string>()
  const packages: ProposalPackage[] = []

  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      adjustments.push('Dropped an unreadable package.')
      return
    }
    const r = raw as Record<string, unknown>
    const name = str(r.name).trim()
    if (!name) {
      adjustments.push('Dropped a package with no name.')
      return
    }

    let id = str(r.id).trim()
    if (!id || seen.has(id)) {
      let n = index
      while (seen.has(`pkg-${n}`)) n += 1
      id = `pkg-${n}`
    }
    seen.add(id)

    const description = str(r.description).trim()
    const recommended = r.recommended === true

    if (Array.isArray(r.item_ids)) {
      // Composed tier: refs must resolve and be unique — anything else is a
      // client bug that would corrupt pricing, so the write is rejected.
      const itemIds = r.item_ids.map((v) => str(v).trim())
      const tierSeen = new Set<string>()
      for (const ref of itemIds) {
        if (!poolIds.has(ref)) {
          throw new ProposalDraftError(`Package "${name}" references an unknown line item — refs must resolve`)
        }
        if (tierSeen.has(ref)) {
          throw new ProposalDraftError(`Package "${name}" contains a duplicate line item reference`)
        }
        tierSeen.add(ref)
      }

      let override: number | undefined
      if (r.price_override !== undefined) {
        if (finite(r.price_override)) {
          override = r.price_override
        } else {
          adjustments.push(`Cleared an invalid price override on "${name}".`)
        }
      }

      const pkg: ProposalPackage = {
        id,
        name,
        ...(description ? { description } : {}),
        includes: [], // never written for composed packages (spec §1)
        price: 0,     // recomputed below — the client-sent price is never trusted
        item_ids: itemIds,
        ...(override !== undefined ? { price_override: override } : {}),
        ...(recommended ? { recommended: true } : {}),
      }
      pkg.price = packagePrice(pkg, pool)
      packages.push(pkg)
      return
    }

    // Legacy tier: includes + flat price stay authoritative (read-only shape,
    // still writable so pre-v2 documents round-trip unchanged).
    if (!finite(r.price)) {
      adjustments.push(`Dropped package "${name}" — its price is not a number.`)
      return
    }
    const includes = Array.isArray(r.includes)
      ? r.includes.map((v) => str(v).trim()).filter(Boolean)
      : []
    packages.push({
      id,
      name,
      ...(description ? { description } : {}),
      includes,
      price: r.price,
      ...(recommended ? { recommended: true } : {}),
    })
  })

  return packages
}

/**
 * Pure validation + normalization for the consolidated autosave payload.
 * Composed package prices are recomputed here (sum or override) and stored
 * denormalized, so every existing reader of `pkg.price` keeps working.
 * Returns what will be persisted plus human-readable adjustments for
 * everything that was dropped or cleaned — never a silent discard.
 */
export function normalizeProposalDraft(
  input: ProposalDraftInput,
): { draft: NormalizedProposalDraft; adjustments: string[] } {
  const adjustments: string[] = []

  const { blocks, adjustments: blockAdjustments } = normalizeBlocks(input.blocks ?? [])
  adjustments.push(...blockAdjustments)

  const line_items = normalizeLineItems(input.line_items, adjustments)
  const packages = normalizePackages(input.packages, line_items, adjustments)

  const title = str(input.title).trim()
  const notes = str(input.notes).trim()
  const deposit_terms = str(input.deposit_terms).trim()
  const expires_at = str(input.expires_at).trim()

  const discount = normalizeMoneyRule(input.discount)
  if (input.discount !== undefined && !discount) adjustments.push('Cleared an invalid discount.')
  const deposit = normalizeMoneyRule(input.deposit)
  if (input.deposit !== undefined && !deposit) adjustments.push('Cleared an invalid deposit.')

  let tax_rate: number | undefined
  if (input.tax_rate !== undefined) {
    if (finite(input.tax_rate) && input.tax_rate >= 0) tax_rate = input.tax_rate
    else adjustments.push('Cleared an invalid tax rate.')
  }

  const deposit_gate =
    input.deposit_gate === 'before_accept' || input.deposit_gate === 'after_accept'
      ? input.deposit_gate
      : undefined

  return {
    draft: {
      ...(title ? { title } : {}),
      ...(notes ? { notes } : {}),
      blocks,
      line_items,
      ...(packages ? { packages } : {}),
      ...(discount ? { discount } : {}),
      ...(tax_rate !== undefined ? { tax_rate } : {}),
      ...(deposit ? { deposit } : {}),
      ...(expires_at ? { expires_at } : {}),
      ...(deposit_gate ? { deposit_gate } : {}),
      ...(deposit_terms ? { deposit_terms } : {}),
    },
    adjustments,
  }
}
