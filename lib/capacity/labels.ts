import type { CapacityUnitKind, Org } from '@/lib/types'

// The single source of the kind vocabulary. The platform is horizontal — "cart"
// / "room" is only BrewTrax's flavour of the two kinds — so every capacity
// surface routes its kind noun through here instead of hardcoding a literal.
const NEUTRAL_DEFAULTS: Record<CapacityUnitKind, { one: string; many: string }> = {
  mobile: { one: 'serving unit', many: 'serving units' },
  venue: { one: 'room', many: 'rooms' },
}

/**
 * The operator's label for a capacity kind. `count === 1` yields the singular,
 * anything else the plural. Falls back to the neutral defaults when the org has
 * set no override for that kind.
 */
export function kindLabel(
  org: Pick<Org, 'resource_labels'>,
  kind: CapacityUnitKind,
  count: number,
): string {
  const override = org.resource_labels?.[kind]
  const one = override?.one || NEUTRAL_DEFAULTS[kind].one
  const many = override?.many || NEUTRAL_DEFAULTS[kind].many
  return count === 1 ? one : many
}
