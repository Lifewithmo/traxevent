import type { OpsPlan } from '@/lib/types'

interface PlanCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  onPlanChange: (next: OpsPlan) => void
}

interface ListsCardProps extends PlanCardProps {
  orgSlug: string
  eventSlug: string
}

// Placeholder — replaced in Task 8.
export function ListsCard({ plan }: ListsCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-gray-500">
        Shopping ({plan.shopping_list.length}) and packing ({plan.packing_list.length}) lists (coming soon)
      </p>
    </div>
  )
}
