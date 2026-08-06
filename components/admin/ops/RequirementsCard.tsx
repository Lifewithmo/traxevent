import type { OpsPlan, WorkPackage } from '@/lib/types'

interface PlanCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  onPlanChange: (next: OpsPlan) => void
}

interface RequirementsCardProps extends PlanCardProps {
  packages: WorkPackage[]
}

// Placeholder — replaced in Task 7.
export function RequirementsCard({ plan }: RequirementsCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-gray-500">Requirements card for {plan.requirements.guests} guests (coming soon)</p>
    </div>
  )
}
