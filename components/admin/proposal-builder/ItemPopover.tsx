'use client'

// Popover for a line item's numbers (spec §4: click the qty/price → popover
// with quantity, unit price, unit). Deliberately dumb: parent owns state.
//
// COLOUR RULE — this popover is anchored on <ProposalTheme>'s sheet, which is
// bg-[var(--warm-0)]: permanently white in both themes. Its surface and ink are
// pinned to the fixed --warm-* ramp; bg-popover/text-popover-foreground invert
// under .dark and would float a near-black card on white paper. See
// BlockCanvas's COLOUR RULE header.
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProposalLineItem } from '@/lib/types'

function toNumber(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

export function ItemPopover({
  item,
  onChange,
  onClose,
}: {
  item: ProposalLineItem
  onChange: (patch: Partial<ProposalLineItem>) => void
  onClose: () => void
}) {
  return (
    <div className="absolute z-30 mt-1 w-56 space-y-2 rounded-md border border-[var(--warm-200)] bg-[var(--warm-0)] p-3 text-[var(--warm-950)] shadow-lg">
      <div className="space-y-1">
        <Label htmlFor="item-qty">Quantity</Label>
        <Input id="item-qty" type="number" value={String(item.quantity)}
          onChange={(e) => onChange({ quantity: toNumber(e.target.value) })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="item-price">Unit price</Label>
        <Input id="item-price" type="number" value={String(item.unit_price)}
          onChange={(e) => onChange({ unit_price: toNumber(e.target.value) })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="item-unit">Unit</Label>
        <Input id="item-unit" value={item.unit ?? ''} placeholder="hr, each, day"
          onChange={(e) => onChange({ unit: e.target.value || undefined })} />
      </div>
      <Button type="button" size="sm" className="w-full" onClick={onClose}>Done</Button>
    </div>
  )
}
