//
// The SINGLE ordered-archetype composition. The public page, the print route
// and the builder canvas all render through this, which is what stops the
// three from drifting apart — see the header of ProposalPricing.tsx for what
// happened the last time a composition was written twice.
//
// COLOUR RULE: permanently-white paper. Explicit var(--warm-N) only.
import type { ReactNode } from 'react'
import { sectionsFromProposal, sectionTreatments, type SectionTreatment } from '@/lib/proposals/sections'
import { isVisibleBlock } from '@/lib/proposals/blocks'
import { CoverSection } from '@/components/proposals/sections/CoverSection'
import { ProseSection } from '@/components/proposals/sections/ProseSection'
import type { OrgBranding, Proposal, ProposalSection, ProposalSectionType } from '@/lib/types'

type CompositionProposal = Pick<
  Proposal,
  'title' | 'sections' | 'blocks' | 'packages' | 'line_items' | 'terms' | 'notes'
>

/** Archetypes rendered from Proposal fields; the host supplies these. */
const DERIVED = new Set<ProposalSectionType>([
  'tiers', 'add_ons', 'investment', 'accept', 'terms',
])

/**
 * Whether a section occupies an alternation slot at all.
 *
 * Derived sections always do — the host decides whether they render, and
 * `sectionTreatments` must still count them. A non-derived section renders
 * NOTHING (see ProseSection's absence rule) when it has no visible blocks,
 * when it is itself flagged `placeholder: true` (skipped on public/print per
 * ProposalSection's type comment) and showPlaceholders is off, or when it was
 * authored/normalized with no `blocks` key at all. Any of these consuming a
 * slot leaves two adjacent bands with the SAME treatment — the "absence that
 * looks like absence" failure the absence rule (spec §15.1) exists to
 * prevent. Must be computed BEFORE sectionTreatments, not after.
 */
function occupiesSlot(section: ProposalSection, showPlaceholders: boolean): boolean {
  // Derived sections and `cover` never carry blocks — they render
  // unconditionally from Proposal fields / branding, so the empty-blocks
  // check below does not apply to them.
  if (DERIVED.has(section.type) || section.type === 'cover') return true
  if (section.placeholder === true && !showPlaceholders) return false
  return (section.blocks ?? []).some((b) => isVisibleBlock(b, showPlaceholders))
}

export function ProposalComposition({
  proposal,
  branding,
  clientName,
  eventDate,
  showPlaceholders = false,
  renderDerived,
}: {
  proposal: CompositionProposal
  branding?: OrgBranding
  clientName?: string
  eventDate?: string
  showPlaceholders?: boolean
  /** Interactive on the public page, static in print — see the plan's Task 8. */
  renderDerived: (type: ProposalSectionType, treatment: SectionTreatment) => ReactNode
}) {
  // Drop non-derived sections that would render nothing BEFORE computing
  // treatments — otherwise they still consume a plain/tinted alternation
  // slot and leave two adjacent bands with the same treatment.
  const sections = sectionsFromProposal(proposal).filter((s) => occupiesSlot(s, showPlaceholders))
  const treatments = sectionTreatments(sections)

  return (
    <>
      {sections.map((section, i) => {
        const treatment = treatments[i]

        if (DERIVED.has(section.type)) {
          return <div key={section.id}>{renderDerived(section.type, treatment)}</div>
        }

        if (section.type === 'cover') {
          return (
            <CoverSection
              key={section.id}
              title={proposal.title ?? ''}
              branding={branding}
              clientName={clientName}
              eventDate={eventDate}
            />
          )
        }

        // Every remaining archetype renders as measure-controlled prose until
        // its own authoring UI lands (see the plan's scope table). Shipping the
        // types and slots now means ordering, treatment and the future Typst
        // mapping are correct from day one and the layout is not re-cut later.
        return (
          <ProseSection
            key={section.id}
            blocks={section.blocks}
            treatment={treatment}
            showPlaceholders={showPlaceholders}
          />
        )
      })}
    </>
  )
}
