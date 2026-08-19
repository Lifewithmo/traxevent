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
 * Whether a NON-DERIVED section occupies an alternation slot at all.
 *
 * Derived sections are handled separately (see the probe in
 * ProposalComposition below) — the host's renderDerived return value is the
 * source of truth for whether they occupy a slot, not a blanket "always
 * true". A non-derived section renders NOTHING (see ProseSection's absence
 * rule) when it has no visible blocks, when it is itself flagged
 * `placeholder: true` (skipped on public/print per ProposalSection's type
 * comment) and showPlaceholders is off, or when it was authored/normalized
 * with no `blocks` key at all. Any of these consuming a slot leaves two
 * adjacent bands with the SAME treatment — the "absence that looks like
 * absence" failure the absence rule (spec §15.1) exists to prevent. Must be
 * computed BEFORE sectionTreatments, not after.
 */
function occupiesSlot(section: ProposalSection, showPlaceholders: boolean): boolean {
  // `cover` never carries blocks — it renders unconditionally from
  // title/branding, so the empty-blocks check below does not apply to it.
  if (section.type === 'cover') return true
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
  // inc2: intentionally unpopulated — no caller (ProposalResponseClient, the
  // print route, or the builder) supplies this today. Threaded through to
  // CoverSection and AcceptedState so both are ready the moment a caller
  // has an actual date to give them (see AcceptedState's own eventDate
  // comment for what that requires).
  eventDate?: string
  showPlaceholders?: boolean
  /** Interactive on the public page, static in print — see the plan's Task 8. */
  renderDerived: (type: ProposalSectionType, treatment: SectionTreatment) => ReactNode
}) {
  // Drop sections that would render nothing BEFORE computing treatments —
  // otherwise they still consume a plain/tinted alternation slot and leave
  // two adjacent bands with the same treatment (spec §15.1).
  //
  // Derived sections are probed with a placeholder treatment purely to learn
  // whether the host renders content for them: every current renderDerived
  // implementation gates on proposal/response state (packages present? any
  // required items? has the customer signed?), never on which treatment
  // class it would receive, so the probe's treatment argument cannot change
  // the null/non-null outcome. The probe's own JSX is discarded; a derived
  // section that survives is rendered again below, once, with its real
  // computed treatment — so the treatment a customer actually sees is always
  // correct, never the placeholder's.
  const rawSections = sectionsFromProposal(proposal)
  const sections = rawSections.filter((s) =>
    DERIVED.has(s.type) ? renderDerived(s.type, 'plain') != null : occupiesSlot(s, showPlaceholders),
  )
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
