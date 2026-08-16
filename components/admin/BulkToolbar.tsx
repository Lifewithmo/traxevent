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
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border text-sm">
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
