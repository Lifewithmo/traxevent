import type { OpsPlan } from '@/lib/types'

interface ReadinessHeaderProps {
  plan: OpsPlan
  eventName: string
  eventStart: string
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  complianceWarnings: { name: string; expires_on: string }[]
  onPlanChange: (next: OpsPlan) => void
}

// Placeholder — replaced in Task 7.
export function ReadinessHeader({ eventName }: ReadinessHeaderProps) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-gray-500">Readiness header for {eventName} (coming soon)</p>
    </div>
  )
}
