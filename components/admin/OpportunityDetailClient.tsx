'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteLead } from '@/actions/leads'
import { LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
import { ContactCard } from '@/components/admin/opportunity/ContactCard'
import { NextActionBanner } from '@/components/admin/opportunity/NextActionBanner'
import { TasksPanel } from '@/components/admin/opportunity/TasksPanel'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import { OpportunityDetailsForm } from '@/components/admin/opportunity/OpportunityDetailsForm'
import { ConvertToWorkCard } from '@/components/admin/opportunity/ConvertToWorkCard'
import type { ActivityEvent, Customer, Event, Lead, Task } from '@/lib/types'
import type { EventType } from '@/lib/event-types'

interface OpportunityDetailClientProps {
  orgId: string
  orgSlug: string
  lead: Lead
  customer: Customer | null
  tasks: Task[]
  activity: ActivityEvent[]
  job: Event | null
  eventTypes: EventType[]
}

export function OpportunityDetailClient({ orgId, orgSlug, lead, customer, tasks, activity, job, eventTypes }: OpportunityDetailClientProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taskInputRef = useRef<HTMLInputElement>(null)

  async function handleDelete() {
    if (!confirm(`Delete "${opportunityTitle(lead)}"? This cannot be undone.`)) return
    setDeleting(true); setError(null)
    try {
      await deleteLead(orgId, lead.id)
      router.push(`/${orgSlug}/leads`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href={`/${orgSlug}/leads`} className="text-sm text-muted-foreground hover:underline">
        ← Back to pipeline
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{opportunityTitle(lead)}</h1>
          <p className="text-sm text-muted-foreground">{LEAD_STAGE_LABELS[lead.stage]}</p>
        </div>
        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <NextActionBanner
        orgId={orgId}
        lead={lead}
        tasks={tasks}
        onAddNextStep={() => taskInputRef.current?.focus()}
      />

      <ConvertToWorkCard orgId={orgId} orgSlug={orgSlug} lead={lead} job={job} eventTypes={eventTypes} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Contact card: first on mobile, right column on desktop */}
        <aside className="order-first space-y-4 lg:order-last lg:col-span-1">
          <ContactCard orgSlug={orgSlug} customer={customer} lead={lead} />
        </aside>
        <div className="space-y-4 lg:col-span-2">
          <TasksPanel ref={taskInputRef} orgId={orgId} leadId={lead.id} tasks={tasks} />
          <ActivityTimeline orgId={orgId} leadId={lead.id} activity={activity} />
          <OpportunityDetailsForm orgId={orgId} orgSlug={orgSlug} lead={lead} customer={customer} />
        </div>
      </div>
    </div>
  )
}
