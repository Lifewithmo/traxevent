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

export function OpsPlanClient(props: OpsPlanClientProps) {
  const [plan, setPlan] = useState<OpsPlan | null>(props.plan)

  if (!plan) {
    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-1">Event Ops — {props.eventName}</h1>
        {props.isAdmin ? (
          <OpsSetup
            orgId={props.orgId}
            eventId={props.eventId}
            packages={props.packages}
            eventStart={props.eventStart}
            industryPackId={props.industryPackId}
            defaultGuests={props.eventHeadcount}
            onCreated={setPlan}
          />
        ) : (
          <p className="mt-4 text-gray-600">
            This event isn&apos;t set up for ops yet. An admin creates the ops plan by picking packages and a guest count.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
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
      <RequirementsCard
        orgId={props.orgId} eventId={props.eventId}
        plan={plan} packages={props.packages} onPlanChange={setPlan}
      />
      <DeadlinesCard orgId={props.orgId} eventId={props.eventId} plan={plan} industryPackId={props.industryPackId} onPlanChange={setPlan} />
      <ListsCard orgId={props.orgId} eventId={props.eventId} plan={plan} orgSlug={props.orgSlug} eventSlug={props.eventSlug} onPlanChange={setPlan} />
      <ChecklistsCard orgId={props.orgId} eventId={props.eventId} plan={plan} onPlanChange={setPlan} />
      <IssuesCard orgId={props.orgId} eventId={props.eventId} issues={props.issues} />
    </div>
  )
}
