import type { OpsPlan } from '@/lib/types'

interface PlanCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  onPlanChange: (next: OpsPlan) => void
}

// Placeholder — replaced in Task 9.
export function ChecklistsCard({ plan }: PlanCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-gray-500">Checklists card — {plan.checklists.length} checklists (coming soon)</p>
    </div>
  )
}
