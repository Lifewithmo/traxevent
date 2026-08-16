'use client'

import { useState } from 'react'
import { OpsSetup } from '@/components/admin/ops/OpsSetup'
import { ReadinessHeader } from '@/components/admin/ops/ReadinessHeader'
import { RequirementsCard } from '@/components/admin/ops/RequirementsCard'
import { DeadlinesCard } from '@/components/admin/ops/DeadlinesCard'
import { ListsCard } from '@/components/admin/ops/ListsCard'
import { ChecklistsCard } from '@/components/admin/ops/ChecklistsCard'
import { IssuesCard } from '@/components/admin/ops/IssuesCard'
import type { OpsPlan, OpsIssue, WorkPackage } from '@/lib/types'

export interface OpsPlanClientProps {
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  isAdmin: boolean
  plan: OpsPlan | null
  issues: OpsIssue[]
  packages: WorkPackage[]
  eventName: string
  eventStart: string
  eventHeadcount?: number
  industryPackId?: string
  complianceWarnings: { name: string; expires_on: string }[]
}

// Renders under the shared event spine (sticky header + tabs), which owns the
// event name — no page-level h1 here.
export function OpsPlanClient(props: OpsPlanClientProps) {
  const [plan, setPlan] = useState<OpsPlan | null>(props.plan)

  if (!plan) {
    return (
      <div className="p-5">
        <div className="max-w-2xl">
          {props.isAdmin ? (
            <OpsSetup
              orgId={props.orgId}
              eventId={props.eventId}
              orgSlug={props.orgSlug}
              packages={props.packages}
              eventStart={props.eventStart}
              industryPackId={props.industryPackId}
              defaultGuests={props.eventHeadcount}
              onCreated={setPlan}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This event isn&apos;t set up for ops yet. An admin creates the ops plan by picking packages and a guest count.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-5">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <RequirementsCard
            orgId={props.orgId} eventId={props.eventId}
            plan={plan} packages={props.packages} onPlanChange={setPlan}
          />
          <DeadlinesCard orgId={props.orgId} eventId={props.eventId} plan={plan} industryPackId={props.industryPackId} onPlanChange={setPlan} />
          <ChecklistsCard orgId={props.orgId} eventId={props.eventId} plan={plan} onPlanChange={setPlan} />
          <ListsCard orgId={props.orgId} eventId={props.eventId} plan={plan} orgSlug={props.orgSlug} eventSlug={props.eventSlug} onPlanChange={setPlan} />
        </div>
        <aside className="space-y-4 max-lg:order-first lg:col-span-2">
          <ReadinessHeader
            plan={plan}
            eventName={props.eventName}
            eventStart={props.eventStart}
            orgId={props.orgId}
            eventId={props.eventId}
            orgSlug={props.orgSlug}
            eventSlug={props.eventSlug}
            complianceWarnings={props.complianceWarnings}
            onPlanChange={setPlan}
          />
          <IssuesCard orgId={props.orgId} eventId={props.eventId} issues={props.issues} />
        </aside>
      </div>
    </div>
  )
}
