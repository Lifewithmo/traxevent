//
// COLOUR RULE: renders inside <ProposalTheme> on permanently-white paper. Use
// explicit var(--warm-N) literals only — never semantic tokens, which carry
// .dark overrides the warm ramp does not have.
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import { isVisibleBlock } from '@/lib/proposals/blocks'
import type { SectionTreatment } from '@/lib/proposals/sections'
import type { ProposalBlock } from '@/lib/types'

/**
 * The measure-controlled prose band. Serves `prose`, `letter`, `logistics`,
 * and — until each gets its own authoring UI — `menu`, `day_plan` and `team`.
 *
 * The measure cap is load-bearing craft, not decoration: line length, widows
 * and orphans are layout-determined and therefore CANNOT be checked by the
 * send gate. They have to be guaranteed here or not at all.
 */
export function ProseSection({
  blocks,
  treatment,
  showPlaceholders = false,
}: {
  blocks?: ProposalBlock[]
  treatment: SectionTreatment
  showPlaceholders?: boolean
}) {
  const visible = (blocks ?? []).filter((b) => isVisibleBlock(b, showPlaceholders))
  // The absence rule: an empty section renders nothing at all rather than an
  // empty band, so removing content changes the rhythm and not the integrity.
  if (visible.length === 0) return null

  return (
    <section
      className={[
        'w-full px-6 py-12 sm:py-16',
        treatment === 'tinted' ? 'bg-[var(--warm-50)]' : '',
      ].join(' ')}
    >
      <div
        data-measure
        className="mx-auto max-w-[68ch] text-pretty text-[var(--warm-700)] [text-wrap:pretty]"
      >
        <ProposalDocument blocks={visible} showPlaceholders={showPlaceholders} />
      </div>
    </section>
  )
}
