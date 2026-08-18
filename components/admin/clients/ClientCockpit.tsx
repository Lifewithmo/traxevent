'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NewOpportunityForm } from '@/components/admin/pipeline/NewOpportunityForm'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import { ClientWorkingRail } from '@/components/admin/clients/ClientWorkingRail'
import { ClientCockpitHeader } from '@/components/admin/clients/ClientCockpitHeader'
import { ClientKpiBand } from '@/components/admin/clients/ClientKpiBand'
import { buildClientRow } from '@/lib/crm/client-list'
import { buildClientStory } from '@/lib/crm/client-story'
import { todayYmd, formatRelativeTime } from '@/lib/opportunity-detail'
import type { Customer, Lead, Note, Invoice, ActivityEvent } from '@/lib/types'
import type { CustomerAR } from '@/lib/crm/ar-rollup'

interface ClientCockpitProps {
  orgId: string
  orgSlug: string
  customer: Customer
  opportunities: Lead[]
  notes: Note[]
  invoices: Invoice[]
  activity: ActivityEvent[]
  ar: CustomerAR
}

function byCreatedDesc<T extends { created_at?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

export function ClientCockpit({ orgId, orgSlug, customer, opportunities, notes, invoices, activity, ar }: ClientCockpitProps) {
  const router = useRouter()
  const [creatingJob, setCreatingJob] = useState(false)

  const today = todayYmd()
  const row = buildClientRow(customer, opportunities, today)
  const story = buildClientStory(row, opportunities, today)
  const mostRecentLeadId = byCreatedDesc(opportunities)[0]?.id
  // "Pinned note" = the most recent note, surfaced above the fold. Note has
  // no `pinned` flag (lib/types.ts) — the full history still lives in the
  // Activity timeline below (createNote also logs a 'note' activity event).
  const latestNote = byCreatedDesc(notes)[0]

  function goToNewProposal() {
    if (mostRecentLeadId) router.push(`/${orgSlug}/leads/${mostRecentLeadId}/proposals/new`)
    else setCreatingJob(true)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <ClientCockpitHeader
        orgId={orgId}
        orgSlug={orgSlug}
        customer={customer}
        group={row.group}
        row={row}
        opportunities={opportunities}
        invoices={invoices}
        ar={ar}
        onNewJob={() => setCreatingJob(true)}
        onNewProposal={goToNewProposal}
      />

      {/* Below lg this is a single implicit grid column (no `grid-cols-*` applies
          until lg:), so the working rail — second in DOM order — folds under
          the spine automatically; only lg: introduces the two-pane split. */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Left: the record */}
        <div className="space-y-4 lg:col-span-3">
          <ClientKpiBand ar={ar} rollup={row.rollup} />

          {story.parts.length > 0 && (
            <p
              className={cn(
                'rounded-xl border bg-card px-4 py-3 text-sm leading-relaxed shadow-xs',
                story.dormant ? 'border-destructive/30' : 'border-border'
              )}
            >
              {story.parts.join('. ')}.
            </p>
          )}

          {latestNote && (
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
              <p className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">Pinned note</p>
              <p className="mt-1 text-sm">{latestNote.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(latestNote.created_at)}</p>
            </div>
          )}

          <ActivityTimeline orgId={orgId} parentType="customer" parentId={customer.id} activity={activity} />
        </div>

        {/* Right: the working rail (Task 19) */}
        <ClientWorkingRail
          orgId={orgId}
          orgSlug={orgSlug}
          customer={customer}
          opportunities={opportunities}
          invoices={invoices}
          ar={ar}
        />
      </div>

      <NewOpportunityForm orgId={orgId} open={creatingJob} onClose={() => setCreatingJob(false)} customer={customer} />
    </div>
  )
}
