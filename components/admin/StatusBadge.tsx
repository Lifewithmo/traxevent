import type { Family } from '@/lib/types'

const STATUS_STYLES: Record<Family['registration_status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  waitlisted: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<Family['registration_status'], string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  waitlisted: 'Waitlist',
  cancelled: 'Cancelled',
}

interface StatusBadgeProps {
  status: Family['registration_status']
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
