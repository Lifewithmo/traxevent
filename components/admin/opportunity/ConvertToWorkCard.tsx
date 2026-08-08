'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { convertOpportunityToWork } from '@/actions/leads'
import { eventCreateFieldsFromType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import type { EventType } from '@/lib/event-types'
import { opportunityTitle } from '@/lib/leads'
import type { Event, Lead } from '@/lib/types'

interface ConvertToWorkCardProps {
  orgId: string
  orgSlug: string
  lead: Lead
  job: Event | null
  eventTypes: EventType[]
  open?: boolean
  blockReason?: string
}

export function ConvertToWorkCard({ orgId, orgSlug, lead, job, eventTypes, open: openProp = false, blockReason }: ConvertToWorkCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(openProp)
  const [name, setName] = useState(opportunityTitle(lead))
  const [date, setDate] = useState(lead.event_date ?? '')
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
    return (
      <div className="rounded-md border border-border px-3 py-2 text-sm">
        Scheduled as <span className="font-medium">{job.name}</span>.{' '}
        <Link href={`/${orgSlug}/${job.slug}/ops`} className="underline">View job →</Link>
      </div>
    )
  }

  // Not won yet: keep the destination visible and say what unblocks it.
  if (lead.stage !== 'closed_won') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
        <p className="text-sm text-muted-foreground">{blockReason ?? 'Mark the deal won to convert.'}</p>
        <Button size="sm" disabled>Convert to work</Button>
      </div>
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
      })
      router.push(`/${orgSlug}/${event.slug}/ops`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to schedule')
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
        <p className="text-sm">This opportunity is won but not scheduled.</p>
        <Button size="sm" onClick={() => setOpen(true)}>Convert to work</Button>
      </div>
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
        <p className="text-sm text-muted-foreground">Next you&apos;ll pick packages and requirements on the job&apos;s ops page.</p>
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
