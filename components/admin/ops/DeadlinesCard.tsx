import type { OpsPlan } from '@/lib/types'

interface PlanCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  onPlanChange: (next: OpsPlan) => void
}

interface DeadlinesCardProps extends PlanCardProps {
  industryPackId?: string
}

// Placeholder — replaced in Task 8.
export function DeadlinesCard({ plan }: DeadlinesCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-gray-500">Deadlines card — {plan.deadlines.length} deadlines (coming soon)</p>
    </div>
  )
}
