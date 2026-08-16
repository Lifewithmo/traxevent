import { Users } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function ClientsPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<Users className="size-4" />}
        title="Select a client from the queue"
        description="Pick someone on the left to see their record."
      />
    </div>
  )
}
