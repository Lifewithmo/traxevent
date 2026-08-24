'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { StatusPill } from '@/components/ui/status-pill'
import { convertOpportunityToWork, setLeadStage } from '@/actions/leads'
import { isCapacityGuardError, capacityGuardMessage } from '@/lib/capacity/guard'
import { eventCreateFieldsFromType, DEFAULT_EVENT_TYPE_ID } from '@/lib/event-types'
import type { EventType } from '@/lib/event-types'
import { opportunityTitle } from '@/lib/leads'
import type { ConvertBlocker } from '@/lib/opportunity-detail'
import { EVENT_KIND_LABELS } from '@/lib/occasions/kind'
import { shortDate } from '@/lib/pipeline-presentation'
import type { Event, Lead, EventKind } from '@/lib/types'

/**
 * The id OpportunityDetailClient stamps on the proposals pane, so the blocked
 * empty state can send the operator to the control that unblocks it. Shared as
 * a constant because the anchor and its target are in different files and a
 * typo'd fragment fails silently.
 */
export const PROPOSALS_ANCHOR = 'lead-proposals'

interface ConvertToWorkCardProps {
  orgId: string
  orgSlug: string
  lead: Lead
  job: Event | null
  eventTypes: EventType[]
  open?: boolean
  blockReason?: string
  /**
   * WHICH blocker `blockReason` is describing. The empty state's CTA has to be
   * the move its own description names, and the two non-won blockers name
   * different moves. Defaults to the honest fallback: with no discriminant the
   * card cannot claim the deal is one click from won.
   */
  blocker?: ConvertBlocker
}

/**
 * "Is this deal a scheduled job yet, and if not, what is stopping me?"
 *
 * Three mutually exclusive states, each a kit surface rather than the bespoke
 * one-line strips they replace: the job exists (a related record), the deal
 * cannot convert yet (an empty naming the reason AND the move that clears it),
 * or it can (an empty with the single CTA). Only the last opens a form, and
 * only on request.
 */
export function ConvertToWorkCard({ orgId, orgSlug, lead, job, eventTypes, open: openProp = false, blockReason, blocker }: ConvertToWorkCardProps) {
  const router = useRouter()
  const [open, setOpen] = useState(openProp)
  const [name, setName] = useState(opportunityTitle(lead))
  const [date, setDate] = useState(lead.event_date ?? '')
  const [kind, setKind] = useState<EventKind>('client_job')
  const [eventTypeId, setEventTypeId] = useState<string>(DEFAULT_EVENT_TYPE_ID)
  const [headcount, setHeadcount] = useState(lead.guest_count != null ? String(lead.guest_count) : '')
  // Booking time, captured at the one moment the client just told us when.
  // Always seeded EMPTY — the Lead has no time-of-day field, so any prefill
  // here would be a fabricated claim (B7). A start/end pair because
  // Event.hours is a pair everywhere it is read; both-or-neither, like the
  // settings and new-event forms.
  const [hoursStart, setHoursStart] = useState('')
  const [hoursEnd, setHoursEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [winning, setWinning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Seed the form from the CURRENT lead, every time it is opened.
   *
   * These three fields used to be `useState(...)` initialisers only, and this
   * card never unmounts — it renders one of four branches on a page that
   * `router.refresh()`es constantly. So: open a won deal with no event date →
   * "Won, but not on the calendar" → set the date from the KPI band's "+ Add
   * date" → refresh lands `lead.event_date` → click "Convert to work" and the
   * Date field is EMPTY with "Schedule job" disabled and nothing saying why.
   * Same for a title corrected through "Edit all details", and for guest count.
   */
  function openForm() {
    setName(opportunityTitle(lead))
    setDate(lead.event_date ?? '')
    setHeadcount(lead.guest_count != null ? String(lead.guest_count) : '')
    setHoursStart('')
    setHoursEnd('')
    setError(null)
    setOpen(true)
  }

  /**
   * Winning from the header actions menu flips `openProp` after mount.
   *
   * Adjusted during render rather than in an effect (the pattern QuickFactDialog
   * and EditableFact both use): an effect would paint the closed card first and
   * re-seed on a second commit, and `react-hooks/set-state-in-effect` rejects it
   * — this file carried one of the repo's pre-existing violations for exactly
   * that call. Keyed on the TRANSITION, so a later `lead` change cannot clobber
   * a half-typed override.
   */
  const [lastOpenProp, setLastOpenProp] = useState(openProp)
  if (openProp !== lastOpenProp) {
    setLastOpenProp(openProp)
    if (openProp) openForm()
  }

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
        onEmptyCta={openForm}
      />
    )
  }

  async function handleMarkWon() {
    if (winning) return
    setWinning(true); setError(null)
    // Latch the form open, seeded from the lead as it stands right now (winning
    // changes the stage, not the title/date/guest count). The card keeps
    // rendering this blocked branch until the refreshed `lead` arrives with
    // `closed_won` — at which point the scheduler is already open, so the
    // operator lands one click from a scheduled job rather than back on "Won,
    // but not on the calendar".
    const settle = () => { openForm(); router.refresh() }
    try {
      await setLeadStage(orgId, lead.id, 'closed_won')
      settle()
    } catch (e: unknown) {
      // SERVER CAPACITY GUARD (increment 4): a would-be over/clash win throws a
      // CapacityGuardError. Confirm (advisory) and, on accept, re-call with
      // { override: true }. A decline leaves the deal un-won, no error.
      if (isCapacityGuardError(e)) {
        if (!window.confirm(capacityGuardMessage(e))) return
        try {
          await setLeadStage(orgId, lead.id, 'closed_won', { override: true })
          settle()
        } catch (e2: unknown) {
          setError(e2 instanceof Error ? e2.message : 'Could not mark this won')
        }
        return
      }
      setError(e instanceof Error ? e.message : 'Could not mark this won')
    } finally {
      setWinning(false)
    }
  }

  /**
   * Not won yet: keep the destination visible, say what unblocks it, and offer
   * THAT MOVE.
   *
   * The CTA slot used to hold `<Button disabled>Convert to work</Button>` — a
   * permanently dead control under a description that names a live next step
   * ("Ready — mark the deal won to convert."). Every other empty in the module
   * offers a working control; this was the one that did not. The move differs
   * per blocker, which is why `blocker` is a prop:
   *   - not_won            → mark it won (and drop into the scheduler)
   *   - unsigned_proposal  → the signature is the blocker, so point at the
   *                          proposals card rather than mint a THIRD "New
   *                          proposal" button on a page that already has two.
   * Unknown blocker → no action at all. A missing CTA is honest; a dead one is
   * not.
   */
  if (lead.stage !== 'closed_won') {
    return (
      <section className="rounded-xl border border-border bg-card shadow-xs">
        <EmptyState
          title="Not scheduled yet"
          description={blockReason ?? 'Mark the deal won to convert.'}
          action={
            blocker === 'not_won' ? (
              <Button size="sm" disabled={winning} onClick={handleMarkWon}>
                {winning ? 'Marking won…' : 'Mark won'}
              </Button>
            ) : blocker === 'unsigned_proposal' ? (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                role="link"
                render={<Link href={`#${PROPOSALS_ANCHOR}`} />}
              >
                Go to proposals
              </Button>
            ) : undefined
          }
        />
        {error && <p className="px-4 pb-4 text-center text-sm text-destructive" role="alert">{error}</p>}
      </section>
    )
  }

  async function handleConvert() {
    const type = eventTypes.find((t) => t.id === eventTypeId)
    if (!type) { setError('Select an event type'); return }
    // Same both-or-neither rule as settings/new-event: a one-sided range would
    // be silently dropped, and end <= start renders flagged on the calendar.
    if (Boolean(hoursStart) !== Boolean(hoursEnd)) {
      setError('Enter both a start and end time, or leave both blank.')
      return
    }
    if (hoursStart && hoursEnd && hoursEnd <= hoursStart) {
      setError('End time must be after the start time.')
      return
    }
    setSaving(true); setError(null)
    try {
      const event = await convertOpportunityToWork(orgId, lead.id, {
        name: name.trim(),
        date,
        ...eventCreateFieldsFromType(type),
        ...(headcount.trim() ? { headcount: Number(headcount) } : {}),
        ...(hoursStart && hoursEnd ? { hours: { start: hoursStart, end: hoursEnd } } : {}),
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
          action={<Button size="sm" onClick={openForm}>Convert to work</Button>}
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
          <div className="space-y-1">
            <Label htmlFor="cw-hours-start">Start time (optional)</Label>
            <Input id="cw-hours-start" type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cw-hours-end">End time (optional)</Label>
            <Input id="cw-hours-end" type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} />
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
