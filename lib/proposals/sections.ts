import { normalizeBlocks } from '@/lib/proposals/blocks'
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
