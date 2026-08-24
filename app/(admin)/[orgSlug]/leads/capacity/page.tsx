export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import type { BillingPlan, Org } from '@/lib/types'
import { listLeads } from '@/actions/leads'
import { OPEN_STAGES } from '@/lib/leads'
import { todayYmd } from '@/lib/opportunity-detail'
import { hasMultiResourceCapacity, listCapacityUnitsCore } from '@/lib/capacity/units'
import { forecastByMonth } from '@/lib/capacity/forecast'
import { buildSchedule } from '@/lib/capacity/schedule'
import { PipelineSubNav } from '@/components/admin/pipeline/PipelineSubNav'
import { CapacityOutlookClient } from '@/components/admin/pipeline/CapacityOutlookClient'

/**
 * Capacity Outlook — the business-tier planning surface (resource-capacity
 * increment 3). Gated identically to the tab that links here: only a business
 * org with ≥1 configured unit ever reaches it; every other org 404s, so the
 * feature stays dark for base/solo. All the math is pure over the leads + units
 * already loaded (one extra `listCapacityUnitsCore` read, business orgs only).
 */
export default async function CapacityOutlookPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const orgId = orgSnap.docs[0].id
  const orgData = orgSnap.docs[0].data()
  const org = { plan: orgData.plan as BillingPlan | undefined }

  // The gate. Non-business orgs never load units; a business org with zero units
  // has nothing to forecast — either way the surface must not exist for them.
  if (!hasMultiResourceCapacity(org)) notFound()
  const units = await listCapacityUnitsCore(orgId)
  if (units.length === 0) notFound()

  const serviceableDays = orgData.serviceable_days as Org['serviceable_days']
  const resourceLabels = orgData.resource_labels as Org['resource_labels']

  const leads = await listLeads(orgId)
  const open = leads.filter((l) => (OPEN_STAGES as (typeof l.stage)[]).includes(l.stage))

  const today = todayYmd()
  const forecast = forecastByMonth(leads, units, { serviceable_days: serviceableDays }, today)
  // Near-term day grid: 4 weeks of dates, legible desktop→mobile and
  // horizontal-scroll-contained on its own container (never the page body).
  const schedule = buildSchedule(leads, units, { serviceable_days: serviceableDays }, today, 28)

  return (
    <div>
      <PipelineSubNav orgSlug={orgSlug} active="capacity" openCount={open.length} showCapacity />
      {/* The Pipeline section's one frame — same `max-w-6xl px-6` as the KPI band
          and both opportunity surfaces, so this content shares their left edge. */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        <CapacityOutlookClient
          orgSlug={orgSlug}
          forecast={forecast}
          schedule={schedule}
          resourceLabels={resourceLabels}
        />
      </div>
    </div>
  )
}
