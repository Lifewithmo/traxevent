import type { Family } from '@/lib/types'
import { Button } from '@/components/ui/button'

interface BulkToolbarProps {
  selectedCount: number
  onStatusChange: (status: Family['registration_status']) => void
  onExport: () => void
  onClear: () => void
}

export function BulkToolbar({
  selectedCount,
  onStatusChange,
  onExport,
  onClear,
}: BulkToolbarProps) {
  if (selectedCount === 0) return null

  return (
    /*
      Wraps cleanly at 375px (flex-wrap + row gap): buttons keep their full
      labels and their ≥24px targets (Button size xs = h-6 = 24px) instead of
      overflowing or truncating. Desktop (one line) is visually unchanged.
    */
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 bg-muted/50 border-b border-border text-sm">
      <span className="font-semibold text-foreground">{selectedCount} selected</span>
      <Button variant="outline" size="xs" onClick={() => onStatusChange('confirmed')}>
        Confirm
      </Button>
      <Button variant="outline" size="xs" onClick={() => onStatusChange('waitlisted')}>
        Waitlist
      </Button>
      <Button variant="destructive" size="xs" onClick={() => onStatusChange('cancelled')}>
        Cancel
      </Button>
      <Button variant="outline" size="xs" onClick={onExport}>
        Export selected
      </Button>
      <div className="flex-1" />
      <Button variant="ghost" size="xs" onClick={onClear} className="text-muted-foreground">
        Clear selection
      </Button>
    </div>
  )
}
