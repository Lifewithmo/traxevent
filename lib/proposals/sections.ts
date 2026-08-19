import { normalizeBlocks } from '@/lib/proposals/blocks'
import type { Proposal } from '@/lib/types'
import {
  PROPOSAL_SECTION_TYPES,
  DERIVED_SECTION_TYPES,
  type ProposalSection,
  type ProposalSectionType,
} from '@/lib/types'

export const MAX_SECTIONS = 24

const KNOWN = new Set<string>(PROPOSAL_SECTION_TYPES)
const DERIVED = new Set<string>(DERIVED_SECTION_TYPES)

export interface NormalizeSectionsResult {
  sections: ProposalSection[]
  adjustments: string[]
}

/**
 * Validate untrusted section input. Mirrors normalizeBlocks' contract: invalid
 * entries are dropped rather than thrown, and every change is reported.
 */
export function normalizeSections(input: unknown): NormalizeSectionsResult {
  const adjustments: string[] = []
  if (!Array.isArray(input)) return { sections: [], adjustments }

  const capped = input.slice(0, MAX_SECTIONS)
  if (input.length > capped.length) {
    adjustments.push(`Kept the first ${MAX_SECTIONS} sections and dropped ${input.length - MAX_SECTIONS}.`)
  }

  const seen = new Set<string>()
  const sections: ProposalSection[] = []

  capped.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const s = raw as Record<string, unknown>
    const type = typeof s.type === 'string' ? s.type : ''
    if (!KNOWN.has(type)) {
      adjustments.push(`Dropped an unsupported section of type "${type || 'unknown'}".`)
      return
    }

    // Same collision walk as normalizeBlocks: a section may legitimately carry
    // the id `sec-1`, which would collide with the fallback minted at index 1.
    let id = typeof s.id === 'string' ? s.id.trim() : ''
    if (!id || seen.has(id)) {
      let n = index
      while (seen.has(`sec-${n}`)) n += 1
      id = `sec-${n}`
    }
    seen.add(id)

    const placeholder = s.placeholder === true ? { placeholder: true as const } : {}

    // Derived sections render from Proposal fields; carrying blocks would let
    // authored content contradict the computed pricing.
    if (DERIVED.has(type)) {
      sections.push({ id, type: type as ProposalSectionType, ...placeholder })
      return
    }

    const { blocks, adjustments: blockAdjustments } = normalizeBlocks(s.blocks)
    adjustments.push(...blockAdjustments)
    sections.push({
      id,
      type: type as ProposalSectionType,
      ...(blocks.length ? { blocks } : {}),
      ...placeholder,
    })
  })

  return { sections, adjustments }
}

type LegacySource = Pick<
  Proposal,
  'sections' | 'blocks' | 'packages' | 'line_items' | 'terms' | 'notes'
>

/**
 * The renderable ordered section list for ANY proposal, old or new.
 *
 * Upgrade-on-read, never upgrade-on-write: a legacy proposal (blocks, no
 * sections) is projected to one `prose` section plus the derived pricing
 * sections. Nothing is persisted, so opening a signed or sent proposal can
 * never mutate it and no hash is disturbed. Mirrors the precedent in
 * lib/proposals/upgrade.ts, which upgrades packages on open.
 */
export function sectionsFromProposal(p: LegacySource): ProposalSection[] {
  if (p.sections?.length) return p.sections

  const out: ProposalSection[] = []
  if (p.blocks?.length) out.push({ id: 'sec-prose', type: 'prose', blocks: p.blocks })
  if (p.packages?.length) out.push({ id: 'sec-tiers', type: 'tiers' })
  if ((p.line_items ?? []).some((i) => i.optional === true && i.id)) {
    out.push({ id: 'sec-addons', type: 'add_ons' })
  }
  // Synthesize a REAL paragraph block from notes rather than an empty section:
  // an empty section renders nothing yet still consumes an alternation slot
  // in sectionTreatments, producing two adjacent identical bands — the exact
  // failure the absence rule (spec §15.1) exists to prevent.
  if (p.notes?.trim()) {
    out.push({
      id: 'sec-notes',
      type: 'prose',
      blocks: [
        { id: 'sec-notes-h', type: 'heading', text: 'Notes', level: 2 },
        { id: 'sec-notes-b0', type: 'paragraph', text: p.notes.trim() },
      ],
    })
  }

  // investment + accept are unconditional: every proposal states a price and
  // offers a decision. terms sits AFTER accept by design (spec §4.1) — the two
  // lowest-value sections must not sit above the highest-value moment.
  out.push({ id: 'sec-investment', type: 'investment' })
  out.push({ id: 'sec-accept', type: 'accept' })
  if (p.terms?.trim()) out.push({ id: 'sec-terms', type: 'terms' })

  return out
}

export type SectionTreatment = 'plain' | 'tinted' | 'bleed'

/** Archetypes that are always full-bleed regardless of position. */
const BLEED: ReadonlySet<string> = new Set(['cover', 'video', 'gallery'])

/**
 * Visual treatment per section, derived ONLY from the rendered sequence
 * (spec §15.1, the absence rule).
 *
 * Authoring the treatment per section would mean that deleting one section
 * leaves two identical bands adjacent — "absence that looks like absence".
 * Computing it here means every archetype is safely optional: the rhythm
 * changes when a section is removed, the integrity does not.
 */
export function sectionTreatments(sections: ProposalSection[]): SectionTreatment[] {
  const out: SectionTreatment[] = []
  let lastFlow: SectionTreatment | null = null

  for (const section of sections) {
    if (BLEED.has(section.type)) {
      out.push('bleed')
      // A bleed resets the flow rhythm — the band after it starts plain again.
      lastFlow = null
      continue
    }
    const next: SectionTreatment = lastFlow === 'plain' ? 'tinted' : 'plain'
    out.push(next)
    lastFlow = next
  }

  return out
}
