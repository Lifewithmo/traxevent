'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { StatusPill } from '@/components/ui/status-pill'
import { convertOpportunityToWork } from '@/actions/leads'
import { eventCreateFieldsFromType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import type { EventType } from '@/lib/event-types'
import { opportunityTitle } from '@/lib/leads'
import { EVENT_KIND_LABELS } from '@/lib/occasions/kind'
import { shortDate } from '@/lib/pipeline-presentation'
import type { Event, Lead, EventKind } from '@/lib/types'

interface ConvertToWorkCardProps {
  orgId: string
  orgSlug: string
  lead: Lead
  job: Event | null
  eventTypes: EventType[]
  open?: boolean
  blockReason?: string
}

/**
 * "Is this deal a scheduled job yet, and if not, what is stopping me?"
 *
 * Three mutually exclusive states, each a kit surface rather than the bespoke
 * one-line strips they replace: the job exists (a related record), the deal
 * cannot convert yet (an empty with the reason), or it can (an empty with the
 * single CTA). Only the last opens a form, and only on request.
 */
export function ConvertToWorkCard({ orgId, orgSlug, lead, job, eventTypes, open: openProp = false, blockReason }: ConvertToWorkCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(openProp)
  const [name, setName] = useState(opportunityTitle(lead))
  const [date, setDate] = useState(lead.event_date ?? '')
  const [kind, setKind] = useState<EventKind>('client_job')
  const [eventTypeId, setEventTypeId] = useState<string>(DEFAULT_EVENT_TYPE_ID)
  const [headcount, setHeadcount] = useState(lead.guest_count != null ? String(lead.guest_count) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Winning from the header (StageMenu) flips the prop after mount.
  useEffect(() => { if (openProp) setOpen(true) }, [openProp])

  // A linked job stays visible no matter what the opportunity's stage does
  // later (e.g. moved back to `proposal` as a correction) — otherwise the
  // job would be orphaned from its opportunity until it is re-won.
  if (job) {
    const rows: RelatedRow[] = [{
      id: job.id,
      title: job.name,
      // `event_start` is a bare YYYY-MM-DD on this path (lib/crm/convert.ts:72).
      subtitle: job.event_start ? shortDate(job.event_start) : 'delivery planning',
      badge: <StatusPill tone="confirmed">Scheduled</StatusPill>,
      href: `/${orgSlug}/${job.slug}/ops`,
    }]
    return (
      <RelatedRecordCard
        title="Scheduled job"
        count={1}
        rows={rows}
        // This card cannot be empty — it only renders when `job` is non-null —
        // but emptyTitle/emptyCtaLabel are required props, and onEmptyCta is
        // optional while the empty Button renders unconditionally, so all three
        // are supplied rather than shipping a dead control on an unreachable path.
        emptyTitle="Not scheduled yet"
        emptyCtaLabel="Convert to work"
        onEmptyCta={() => setOpen(true)}
      />
    )
  }

  // Not won yet: keep the destination visible and say what unblocks it.
  if (lead.stage !== 'closed_won') {
    return (
      <section className="rounded-xl border border-border bg-card shadow-xs">
        <EmptyState
          title="Not scheduled yet"
          description={blockReason ?? 'Mark the deal won to convert.'}
          action={<Button size="sm" disabled>Convert to work</Button>}
        />
      </section>
    )
  }

  async function handleConvert() {
    const type = eventTypes.find((t) => t.id === eventTypeId)
    if (!type) { setError('Select an event type'); return }
    setSaving(true); setError(null)
    try {
      const event = await convertOpportunityToWork(orgId, lead.id, {
        name: name.trim(),
        date,
        ...eventCreateFieldsFromType(type),
        ...(headcount.trim() ? { headcount: Number(headcount) } : {}),
        ...(kind === 'market_day' ? { kind } : {}),
      })
      router.push(`/${orgSlug}/${event.slug}/${kind === 'market_day' ? 'dashboard' : 'ops'}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to schedule')
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <section className="rounded-xl border border-border bg-card shadow-xs">
        <EmptyState
          title="Won, but not on the calendar"
          description="Convert it into a job to plan packages, staffing and delivery."
          action={<Button size="sm" onClick={() => setOpen(true)}>Convert to work</Button>}
        />
      </section>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Schedule this job</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cw-name">Job name</Label>
            <Input id="cw-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw-date">Date</Label>
            <Input id="cw-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw-kind">Kind</Label>
            <select
              id="cw-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as EventKind)}
              className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {(Object.entries(EVENT_KIND_LABELS) as Array<[EventKind, string]>).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw-type">Event type</Label>
            <select
              id="cw-type"
              value={eventTypeId}
              onChange={(e) => setEventTypeId(e.target.value)}
              className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw-headcount">Headcount</Label>
            <Input id="cw-headcount" type="number" value={headcount} onChange={(e) => setHeadcount(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {kind === 'market_day'
            ? 'Next you can set the location and hours on the day\'s settings.'
            : 'Next you\'ll pick packages and requirements on the job\'s ops page.'}
        </p>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={handleConvert} disabled={saving || !name.trim() || !date}>
            {saving ? 'Scheduling…' : 'Schedule job'}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  )
}
