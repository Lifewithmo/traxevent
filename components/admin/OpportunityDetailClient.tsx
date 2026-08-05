'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { deleteLead } from '@/actions/leads'
import { LEAD_STAGE_LABELS } from '@/lib/leads'
import { ContactCard } from '@/components/admin/opportunity/ContactCard'
import { NextActionBanner } from '@/components/admin/opportunity/NextActionBanner'
import { TasksPanel } from '@/components/admin/opportunity/TasksPanel'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import { OpportunityDetailsForm } from '@/components/admin/opportunity/OpportunityDetailsForm'
import type { ActivityEvent, Customer, Lead, Task } from '@/lib/types'

interface OpportunityDetailClientProps {
  orgId: string
  orgSlug: string
  lead: Lead
  customer: Customer | null
  tasks: Task[]
  activity: ActivityEvent[]
}

export function OpportunityDetailClient({ orgId, orgSlug, lead, customer, tasks, activity }: OpportunityDetailClientProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taskInputRef = useRef<HTMLInputElement>(null)

  async function handleDelete() {
    if (!confirm(`Delete "${lead.name}"? This cannot be undone.`)) return
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
          <h1 className="text-2xl font-bold">{lead.name}</h1>
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

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Contact card: first on mobile, right column on desktop */}
        <aside className="order-first space-y-4 lg:order-last lg:col-span-1">
          <ContactCard customer={customer} lead={lead} />
        </aside>
        <div className="space-y-4 lg:col-span-2">
          <TasksPanel ref={taskInputRef} orgId={orgId} leadId={lead.id} tasks={tasks} />
          <ActivityTimeline orgId={orgId} leadId={lead.id} activity={activity} />
          <OpportunityDetailsForm orgId={orgId} lead={lead} />
        </div>
      </div>
    </div>
  )
}
