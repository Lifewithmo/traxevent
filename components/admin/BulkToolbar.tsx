import type { Family } from '@/lib/types'

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
    <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border-b border-purple-200 text-sm">
      <span className="font-semibold text-purple-800">{selectedCount} selected</span>
      <button
        onClick={() => onStatusChange('confirmed')}
        className="px-3 py-1 rounded-md bg-white border border-purple-200 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
      >
        Confirm
      </button>
      <button
        onClick={() => onStatusChange('waitlisted')}
        className="px-3 py-1 rounded-md bg-white border border-purple-200 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
      >
        Waitlist
      </button>
      <button
        onClick={() => onStatusChange('cancelled')}
        className="px-3 py-1 rounded-md bg-white border border-purple-200 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onExport}
        className="px-3 py-1 rounded-md bg-white border border-purple-200 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
      >
        Export selected
      </button>
      <div className="flex-1" />
      <button
        onClick={onClear}
        className="text-purple-500 hover:text-purple-700 text-xs"
      >
        Clear selection
      </button>
    </div>
  )
}
