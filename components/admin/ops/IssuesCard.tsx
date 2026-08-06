import type { OpsIssue } from '@/lib/types'

interface IssuesCardProps {
  orgId: string
  eventId: string
  issues: OpsIssue[]
}

// Placeholder — replaced in Task 10.
export function IssuesCard({ issues }: IssuesCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-gray-500">Issues card — {issues.length} issues (coming soon)</p>
    </div>
  )
}
