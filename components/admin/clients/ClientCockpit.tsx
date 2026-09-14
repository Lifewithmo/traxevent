'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NewOpportunityForm } from '@/components/admin/pipeline/NewOpportunityForm'
import { CreatedToast } from '@/components/admin/pipeline/CreatedToast'
import { getBookabilityCtx } from '@/actions/bookability'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import { ClientWorkingRail } from '@/components/admin/clients/ClientWorkingRail'
import { ClientCockpitHeader } from '@/components/admin/clients/ClientCockpitHeader'
import { ClientKpiBand } from '@/components/admin/clients/ClientKpiBand'
import { buildClientRow } from '@/lib/crm/client-list'
import { buildClientStory } from '@/lib/crm/client-story'
import { todayYmd, formatRelativeTime } from '@/lib/opportunity-detail'
import type { Customer, Lead, Note, Invoice, ActivityEvent, Org } from '@/lib/types'
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
  // Server-computed create-form context (New Opportunity inc 1, contract C5):
  // business tier + ≥1 active venue unit gates the delivery toggle.
  showDeliveryMode?: boolean
  // The org's event-type profiles (event types inc 1) — the form's matching
  // source for the hint, delivery-mode hiding, and the event_type_id payload
  // (it ignores archived entries itself).
  eventTypeProfiles?: Org['event_type_profiles']
  // Owner/admin: the create form offers the in-list "+ New event type…"
  // option and hint action. Computed server-side from the member role.
  canCreateEventTypes?: boolean
  // The operator's kind vocabulary for the inline-create popover's policy
  // toggles ("needs cart" in their words via kindLabel).
  resourceLabels?: Org['resource_labels']
}

function byCreatedDesc<T extends { created_at?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

export function ClientCockpit({
  orgId, orgSlug, customer, opportunities, notes, invoices, activity, ar, showDeliveryMode,
  eventTypeProfiles, canCreateEventTypes, resourceLabels,
}: ClientCockpitProps) {
  const router = useRouter()
  const [creatingJob, setCreatingJob] = useState(false)
  // The after-create toast ("Job created for {name}"). The cockpit stays put —
  // the refreshed rail shows the job — so the toast is the close-the-loop
  // signal, keyed by the lead so a second create re-arms its own 8s clock.
  const [createdJob, setCreatedJob] = useState<Lead | null>(null)

  const today = todayYmd()
  const row = buildClientRow(customer, opportunities, today)
  const story = buildClientStory(row, opportunities, today)
  const mostRecentJob = byCreatedDesc(opportunities)[0]
  const mostRecentLeadId = mostRecentJob?.id
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

      {/* Below lg this is one explicit `grid-cols-1` column (minmax(0,1fr)) so the
          record + rail SHRINK to the viewport — a bare implicit `auto` column grows
          to content instead, which clipped the record on phones/tablets. Both
          children carry `min-w-0` so their content wraps rather than forcing width.
          Only lg: introduces the two-pane split (rail second in DOM order). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left: the record */}
        <div className="min-w-0 space-y-4 lg:col-span-3">
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

        {/* Right: the working rail (Task 19). It TRIGGERS the create form via
            onNewJob and no longer owns an instance — one form per page (inc 1);
            two instances meant duplicate field ids in one document. */}
        <ClientWorkingRail
          orgId={orgId}
          orgSlug={orgSlug}
          customer={customer}
          opportunities={opportunities}
          invoices={invoices}
          ar={ar}
          onNewJob={() => setCreatingJob(true)}
        />
      </div>

      {/*
        THE ONE FORM INSTANCE (contract C5). Cockpit specifics, per the spec's
        role table ("Owner on the Client cockpit"):
        • `customer` pins WHO — the form skips the picker and contact fields.
        • ctx is LAZY (contract C3): most cockpit visits never open the form,
          so the bookability context is fetched by the form once on first open
          instead of being paid for on every page render (2–3 reads).
        • `initialValues` seed type + guests from the client's most recent job
          — repeat business usually repeats its shape; both stay editable.
      */}
      <NewOpportunityForm
        orgId={orgId}
        orgSlug={orgSlug}
        open={creatingJob}
        onClose={() => setCreatingJob(false)}
        customer={customer}
        showDeliveryMode={showDeliveryMode}
        eventTypeProfiles={eventTypeProfiles}
        canCreateEventTypes={canCreateEventTypes}
        resourceLabels={resourceLabels}
        // C5b: the pinned customer's own history IS their past-job count.
        pastJobCounts={{ [customer.id]: opportunities.length }}
        // Slug-only by contract (C5b): the action resolves the org from the
        // slug and asserts membership on the RESOLVED id — a caller-supplied
        // id pair was a cross-tenant read.
        loadBookabilityCtx={() => getBookabilityCtx(orgSlug)}
        initialValues={mostRecentJob
          ? { event_type: mostRecentJob.event_type, guest_count: mostRecentJob.guest_count }
          : undefined}
        // C5b: while save-and-create-another keeps the dialog up (stayedOpen),
        // the toast would sit under its backdrop — the form announces that
        // create in its own aria-live region instead.
        onCreated={(lead: Lead, info: { stayedOpen: boolean }) => {
          if (!info.stayedOpen) setCreatedJob(lead)
        }}
      />

      {createdJob && (
        <CreatedToast
          key={createdJob.id}
          message={`Job created for ${customer.name}`}
          href={`/${orgSlug}/leads/${createdJob.id}`}
          onDismiss={() => setCreatedJob(null)}
        />
      )}
    </div>
  )
}
