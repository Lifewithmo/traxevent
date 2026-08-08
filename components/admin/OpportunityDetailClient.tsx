'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { deleteLead } from '@/actions/leads'
import { LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
import { ContactCard } from '@/components/admin/opportunity/ContactCard'
import { NextActionBanner } from '@/components/admin/opportunity/NextActionBanner'
import { TasksPanel } from '@/components/admin/opportunity/TasksPanel'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import { FactsGrid } from '@/components/admin/opportunity/FactsGrid'
import { ConvertToWorkCard } from '@/components/admin/opportunity/ConvertToWorkCard'
import { MarkLostDialog } from '@/components/admin/opportunity/MarkLostDialog'
import { StageMenu } from '@/components/admin/opportunity/StageMenu'
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
  pastBookings?: number
  convertBlockReason?: string
}

export function OpportunityDetailClient({ orgId, orgSlug, lead, customer, tasks, activity, job, eventTypes, pastBookings = 0, convertBlockReason }: OpportunityDetailClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [convertOpen, setConvertOpen] = useState(searchParams.get('convert') === '1')
  const [moreOpen, setMoreOpen] = useState(false)
  const taskInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchParams.get('focus') === 'task') taskInputRef.current?.focus()
  }, [searchParams])

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
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Link href={`/${orgSlug}/leads`} className="text-sm text-muted-foreground hover:underline">
        ← Back to pipeline
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-2xl font-bold">{opportunityTitle(lead)}</h1>
          <Badge variant="secondary">{LEAD_STAGE_LABELS[lead.stage]}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MarkLostDialog orgId={orgId} leadId={lead.id} onDone={() => router.refresh()} />
          <StageMenu orgId={orgId} lead={lead} onWon={() => setConvertOpen(true)} />
          <div className="relative">
            <Button variant="ghost" size="icon" aria-label="More actions" onClick={() => setMoreOpen((v) => !v)}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {moreOpen && (
              <div role="menu" aria-label="More actions" className="absolute right-0 z-10 mt-1 w-36 rounded-md border bg-background p-1 shadow-md">
                <button
                  type="button"
                  role="menuitem"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-muted disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <NextActionBanner
        orgId={orgId}
        lead={lead}
        tasks={tasks}
        onAddNextStep={() => taskInputRef.current?.focus()}
      />

      <ContactCard orgSlug={orgSlug} customer={customer} lead={lead} variant="strip" pastBookings={pastBookings} />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Left: the record */}
        <div className="space-y-4 lg:col-span-3">
          <FactsGrid orgId={orgId} orgSlug={orgSlug} lead={lead} customer={customer} />
          <ConvertToWorkCard
            orgId={orgId}
            orgSlug={orgSlug}
            lead={lead}
            job={job}
            eventTypes={eventTypes}
            open={convertOpen}
            blockReason={convertBlockReason}
          />
        </div>

        {/* Right: the working column */}
        <aside className="space-y-4 lg:col-span-2">
          <TasksPanel ref={taskInputRef} orgId={orgId} leadId={lead.id} tasks={tasks} />
          <ActivityTimeline orgId={orgId} leadId={lead.id} activity={activity} />
        </aside>
      </div>
    </div>
  )
}
