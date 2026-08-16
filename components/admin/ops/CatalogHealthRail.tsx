import { cn } from '@/lib/utils'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { uncostedConsumables, type PackageCosting, type UncostedReason } from '@/lib/ops/catalog-costing'
import type { OpsResource, WorkPackage } from '@/lib/types'

/** Why a package has no materials figure, in operator language. Shared with the
 *  "Not costed" pill on the package card so the rail and the card never disagree.
 *  Lives here (not in PackagesTab) because PackagesTab imports this module — the
 *  other direction would be a cycle. */
export const UNCOSTED_REASON_HELP: Record<UncostedReason, string> = {
  'no-capacity': 'Set a max guest count to cost this package',
  // Covers two distinct failures on purpose: no ingredient carries a unit cost,
  // AND every ingredient that does carry one is denominated in a unit the line's
  // own unit cannot convert to. "has a unit cost" was false in the second case.
  'no-costed-ingredient': 'No ingredient on this package can be priced yet',
  'no-consumables': 'This package has no consumable ingredients',
}

// Both cards are read-only summaries of the list beside them, so no `onNew` and
// no `onEmptyCta` — RelatedRecordCard renders an empty-state button only when it
// has a handler to run, so passing neither is all it takes to suppress it.
// An empty card is a "here's how" invitation that costs real scroll on a phone,
// so it hides below lg — the same rule ClientWorkingRail applies at md.
const EMPTY_CARD = 'max-lg:hidden'

interface CatalogHealthRailProps {
  packages: WorkPackage[]
  resources: OpsResource[]
  costing: PackageCosting[]
  className?: string
}

export function CatalogHealthRail({ packages, resources, costing, className }: CatalogHealthRailProps) {
  const needsCost: RelatedRow[] = uncostedConsumables(resources).map((r) => ({
    id: r.id,
    title: r.name,
    subtitle: r.unit ?? 'No unit recorded',
  }))

  const costingById = new Map(costing.map((c) => [c.id, c]))
  const notCosted: RelatedRow[] = packages.flatMap((p) => {
    const c = costingById.get(p.id)
    if (!c || c.costed) return []
    return [{
      id: p.id,
      title: p.name,
      subtitle: c.reason ? UNCOSTED_REASON_HELP[c.reason] : undefined,
    }]
  })

  return (
    <aside className={cn('space-y-4', className)}>
      <RelatedRecordCard
        title="Needs a cost"
        count={needsCost.length}
        rows={needsCost}
        emptyTitle="Every ingredient is costed"
        className={needsCost.length === 0 ? EMPTY_CARD : undefined}
      />
      <RelatedRecordCard
        title="Not yet costed"
        count={notCosted.length}
        rows={notCosted}
        emptyTitle="Every package has a materials figure"
        className={notCosted.length === 0 ? EMPTY_CARD : undefined}
      />
    </aside>
  )
}
