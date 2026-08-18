'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, Phone } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusPill } from '@/components/ui/status-pill'
import { DeliveryModeToggle, type DeliveryMode } from '@/components/admin/pipeline/DeliveryModeToggle'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateLead } from '@/actions/leads'
import { LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
import { STAGE_TONE } from '@/lib/pipeline-presentation'
import { opportunityRollup } from '@/lib/opportunity-rollup'
import { ContactCard } from '@/components/admin/opportunity/ContactCard'
import { CopyPortalLinkButton } from '@/components/admin/opportunity/CopyPortalLinkButton'
import { NextActionBanner } from '@/components/admin/opportunity/NextActionBanner'
import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import { DatesPanel } from '@/components/admin/opportunity/DatesPanel'
import { FactsGrid } from '@/components/admin/opportunity/FactsGrid'
import { MarkLostDialog } from '@/components/admin/opportunity/MarkLostDialog'
import { OpportunityActionsMenu } from '@/components/admin/opportunity/OpportunityActionsMenu'
import { OpportunityKpiBand } from '@/components/admin/opportunity/OpportunityKpiBand'
import { TasksPanel, type TasksPanelHandle } from '@/components/admin/opportunity/TasksPanel'
import { ConvertToWorkCard, PROPOSALS_ANCHOR } from '@/components/admin/opportunity/ConvertToWorkCard'
import { LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'
import { LeadVendorsClient } from '@/components/admin/LeadVendorsClient'
import type { ActivityEvent, Customer, Event, Lead, NormalizedInvoice, Proposal, Task, Vendor } from '@/lib/types'
import type { EventType } from '@/lib/event-types'
import type { ConvertBlocker } from '@/lib/opportunity-detail'
import type { CalendarItem } from '@/lib/calendar'

interface OpportunityDetailClientProps {
  orgId: string
  orgSlug: string
  lead: Lead
  customer: Customer | null
  tasks: Task[]
  activity: ActivityEvent[]
  job: Event | null
  eventTypes: EventType[]
  proposals: Proposal[]
  invoices: NormalizedInvoice[]
  vendors: Vendor[]
  acceptedProposals: { id: string; title: string }[]
  pastBookings?: number
  convertBlockReason?: string
  convertBlocker?: ConvertBlocker
  today: string
  calendarItems: CalendarItem[]
  // Business-tier org with ≥1 active venue unit: show the offsite / on-site
  // delivery control. Computed on the server page; the client never queries the
  // plan or units. Undefined ⇒ hidden (nothing to choose without a room).
  showDeliveryMode?: boolean
}

type QuickFact = 'value' | 'date'

const QUICK_FACT_COPY: Record<QuickFact, { title: string; description: string; label: string }> = {
  value: {
    title: 'Estimated value',
    description: 'What you expect this deal to be worth. Quoted, not invoiced — it drives the pipeline figures.',
    label: 'Estimated value',
  },
  date: {
    title: 'Event date',
    description: 'The day the work happens. It drives the countdown and everything scheduled off it.',
    label: 'Event date',
  },
}

/**
 * The "+ Add value" / "+ Add date" affordances on the KPI band need somewhere
 * to land. FactsGrid owns its own edit toggle and takes no props to open it, so
 * a one-field dialog is both the smaller change and the better one: the tile
 * asked for exactly one figure, and a full details form would be an answer to a
 * question the operator did not ask.
 */
function QuickFactDialog({
  orgId, leadId, fact, onClose,
}: { orgId: string; leadId: string; fact: QuickFact | null; onClose: () => void }) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = fact ? QUICK_FACT_COPY[fact] : null

  // ONE `value` serves both facts, so it MUST be cleared when the fact changes.
  // Otherwise "+ Add value" 500 followed by "+ Add date" hands the date branch
  // "500": type="date" sanitises that out of the input, so the operator sees an
  // EMPTY field, presses Save, and a bare string lands in Lead.event_date with
  // no error and no visible change. Clearing `error` on the same beat is the
  // same bug wearing a different hat — a failed save's message would otherwise
  // greet the next dialog as if the fresh field had already been rejected.
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component before committing, so the fresh dialog never paints the previous
  // one's leftovers. An effect would paint them first and then clear them —
  // which is also why `react-hooks/set-state-in-effect` rejects it.
  const [lastFact, setLastFact] = useState(fact)
  if (fact !== lastFact) {
    setLastFact(fact)
    setValue('')
    setError(null)
  }

  async function save() {
    if (!fact) return
    // Re-entrancy guard, matching EditableFact.commit() (FactsGrid.tsx:74-82).
    // The Save Button is `disabled={saving}` but the Enter path at onKeyDown
    // below bypasses it, and `value` is not cleared until after the await — so
    // held/repeated Enter fired updateLead, and then router.refresh(), once per
    // keypress. The two new inline-edit surfaces must not disagree about this.
    if (saving) return
    setSaving(true); setError(null)
    try {
      if (fact === 'value') {
        const parsed = Number(value)
        if (value.trim() === '' || Number.isNaN(parsed)) { setError('Enter a number.'); return }
        // A typo'd "-500" saved silently and then propagated untinted into the
        // board column sums, the list group rollups and this page's own
        // "Est. value" tile, where money(-500) renders "$-500" in money green.
        if (parsed < 0) { setError('Enter a positive amount.'); return }
        await updateLead(orgId, leadId, { estimated_value: parsed })
      } else {
        // Emptiness is not date-ness. Save persists `value` directly, so the
        // guard has to test the SHAPE being written, not merely that something
        // is there.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { setError('Pick a date.'); return }
        await updateLead(orgId, leadId, { event_date: value })
      }
      onClose()
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={fact !== null} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy?.title ?? ''}</DialogTitle>
          <DialogDescription>{copy?.description ?? ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="qf-input">{copy?.label ?? ''}</Label>
          <Input
            id="qf-input"
            type={fact === 'value' ? 'number' : 'date'}
            min={fact === 'value' ? '0' : undefined}
            step={fact === 'value' ? '0.01' : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
            placeholder={fact === 'value' ? '0' : undefined}
          />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The delivery-mode control on the cockpit rail — offered only for a
 * business-tier org that has a room to host in (`showDeliveryMode`, gated on the
 * server). It is the demand signal the capacity radar reads: an on-site event
 * consumes one of the operator's rooms, an offsite one takes a serving unit to
 * the venue. Default offsite.
 *
 * Persisted OPTIMISTICALLY: the segment flips immediately, `updateLead` writes,
 * `router.refresh()` re-pulls the page (the radar recomputes off the new mode).
 * A rejected write rolls the segment back and shows the reason, mirroring the
 * inline-edit pattern used by QuickFactDialog above — an operator must never be
 * left looking at a mode the server did not accept.
 */
function DeliveryModeControl({ orgId, lead }: { orgId: string; lead: Lead }) {
  const router = useRouter()
  const [mode, setMode] = useState<DeliveryMode>(lead.delivery_mode ?? 'offsite')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: DeliveryMode) {
    if (next === mode || saving) return
    const prev = mode
    setMode(next)
    setSaving(true)
    setError(null)
    try {
      await updateLead(orgId, lead.id, { delivery_mode: next })
      router.refresh()
    } catch (e: unknown) {
      setMode(prev)
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <DeliveryModeToggle
          value={mode}
          onChange={change}
          disabled={saving}
          idPrefix={`delivery-${lead.id}`}
        />
        <p className="text-xs text-muted-foreground">
          On-site events use one of your rooms; offsite events send a serving unit to the venue.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

/**
 * The opportunity cockpit.
 *
 * JOB: decide the next move on this deal — chase it, price it, close it or kill
 * it — and take that move without leaving the page.
 *
 * DECIDING VALUE: the next action and how overdue it is. NextActionBanner is
 * the focal element, full width above the split, tone-filled by health; the
 * four KPI figures under it (value / days to event / past bookings / open
 * balance) are what qualify the decision.
 *
 * ORDER, which is not the schema's: who and where it stands (header) → what to
 * do next (banner) → is it worth it and how urgent (band) → what is queued
 * (tasks) → what has happened (timeline) → the two things you DO about it
 * (proposals, invoices). Reference material an operator consults rather than
 * decides from — contact, the convert gate, facts, dates, vendors — sits in the
 * rail at 2/5 width. Below lg no `grid-cols-*` applies, so the rail folds under
 * the spine in DOM order automatically.
 *
 * The split is by ROLE, not by record kind: proposals and invoices are related
 * records but an operator acts on them (send the proposal, bill the deal), so
 * they belong beside the decision. Sorting by kind is what left the rail
 * carrying seven stacked panels against a spine half its height.
 *
 * Deliberately NOT here: a prose story lede under the band. The banner already
 * IS this screen's sentence (heading + "last touch N days ago" detail), and its
 * inputs are the same stage/last-touch/days-out the lede would restate. Two
 * ledes stacked would render the same facts twice — see buildClientStory on the
 * Clients cockpit, where the header carries no equivalent narrative.
 */
export function OpportunityDetailClient({ orgId, orgSlug, lead, customer, tasks, activity, job, eventTypes, proposals, invoices, vendors, acceptedProposals, pastBookings = 0, convertBlockReason, convertBlocker, today, calendarItems, showDeliveryMode }: OpportunityDetailClientProps) {
  const searchParams = useSearchParams()
  const [convertOpen, setConvertOpen] = useState(searchParams.get('convert') === '1')
  /**
   * `?focus=lost` — the landing half of StageChip's "Mark lost", which both the
   * list (PipelineListClient.tsx:173) and the board (PipelineBoardView.tsx:395)
   * push. Nothing read the parameter before this, so the destructive menu item
   * navigated here with nothing focused and no dialog open, and the operator
   * had to find "Mark lost" a second time in the actions menu.
   *
   * A `useState` latch, exactly like `convertOpen` above and for the same
   * reason: `searchParams` does not change when the dialog is dismissed, so a
   * value derived from it on every render would slam the dialog back open on
   * the next re-render (and every `router.refresh()` triggers one).
   */
  const [lostOpen, setLostOpen] = useState(searchParams.get('focus') === 'lost')
  const [quickFact, setQuickFact] = useState<QuickFact | null>(null)
  const router = useRouter()
  const taskInputRef = useRef<TasksPanelHandle>(null)

  useEffect(() => {
    if (searchParams.get('focus') === 'task') taskInputRef.current?.openComposer()
  }, [searchParams])

  const rollup = opportunityRollup({ lead, invoices, tasks, pastBookings, today })
  const name = customer?.name ?? lead.name
  const email = customer?.email ?? lead.email
  const phone = customer?.phone ?? lead.phone

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Link href={`/${orgSlug}/leads`} className="text-sm text-muted-foreground hover:underline">
        ← Back to pipeline
      </Link>

      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold">{opportunityTitle(lead)}</h1>
                <StatusPill tone={STAGE_TONE[lead.stage]}>{LEAD_STAGE_LABELS[lead.stage]}</StatusPill>
              </div>
              {name !== opportunityTitle(lead) && (
                <p className="truncate text-sm text-muted-foreground">{name}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {email && (
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`mailto:${email}`} />}>
                <Mail /> Email
              </Button>
            )}
            {phone && (
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={`tel:${phone}`} />}>
                <Phone /> Call
              </Button>
            )}
            <OpportunityActionsMenu
              orgId={orgId}
              orgSlug={orgSlug}
              lead={lead}
              onWon={() => setConvertOpen(true)}
              onDone={() => router.refresh()}
            />
          </div>
        </div>
      </header>

      <NextActionBanner
        orgId={orgId}
        lead={lead}
        tasks={tasks}
        onAddNextStep={() => taskInputRef.current?.openComposer()}
      />

      {/* R8. `grid-cols-1` and `min-w-0` are both load-bearing below lg, and the
          bug they fix is invisible in jsdom: without an explicit column the
          single track is IMPLICIT and sized `auto`, so it grows to the spine's
          min-content (398px measured at a 375px viewport) and the page scrolls
          sideways. `grid-cols-1` pins the track to minmax(0,1fr); `min-w-0`
          clears each pane's automatic minimum size so it can actually shrink
          into it. Verified at 375 / 1024 / 1080 / 1440. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Spine: the decision and its evidence.
            Proposals and invoices live HERE, not in the rail, and that is a
            correction: the rail unconditionally stacked seven panels (~1,200px)
            beside a fresh inquiry's ~460px spine, so the 60% column dead-ended
            into ~700px of nothing — R3 inverted, only rotated. These two are
            also the only related-record panes an operator ACTS on (send the
            proposal, bill the deal), so they are decisions, not reference, and
            below lg they now fold above the reference cards instead of under
            five of them. */}
        <div data-slot="cockpit-spine" className="min-w-0 space-y-4 lg:col-span-3">
          <OpportunityKpiBand
            rollup={rollup}
            eventDate={lead.event_date}
            onAddValue={() => setQuickFact('value')}
            onAddDate={() => setQuickFact('date')}
          />
          <TasksPanel ref={taskInputRef} orgId={orgId} leadId={lead.id} tasks={tasks} />
          <ActivityTimeline orgId={orgId} parentType="opportunity" parentId={lead.id} activity={activity} />
          {/* `scroll-mt-24` clears the sticky header: without it the blocked
              convert card's "Go to proposals" anchor lands with the card's own
              title underneath it. */}
          <div id={PROPOSALS_ANCHOR} className="scroll-mt-24">
            <LeadProposalsClient orgId={orgId} orgSlug={orgSlug} leadId={lead.id} proposals={proposals} />
          </div>
          <LeadInvoicesClient
            orgId={orgId}
            orgSlug={orgSlug}
            leadId={lead.id}
            invoices={invoices}
            acceptedProposals={acceptedProposals}
          />
        </div>

        {/* Working rail: reference, not decision. Convert sits second because on
            a won deal it is the only forward move left, and burying it under the
            related-record cards puts it off the bottom of a folded mobile page. */}
        <aside data-slot="cockpit-rail" className="min-w-0 space-y-4 lg:col-span-2">
          <ContactCard
            orgSlug={orgSlug}
            customer={customer}
            lead={lead}
            variant="strip"
            pastBookings={pastBookings}
            portalAction={<CopyPortalLinkButton orgId={orgId} leadId={lead.id} />}
          />
          <ConvertToWorkCard
            orgId={orgId}
            orgSlug={orgSlug}
            lead={lead}
            job={job}
            eventTypes={eventTypes}
            open={convertOpen}
            blockReason={convertBlockReason}
            blocker={convertBlocker}
          />
          <FactsGrid orgId={orgId} orgSlug={orgSlug} lead={lead} customer={customer} />
          {showDeliveryMode && <DeliveryModeControl orgId={orgId} lead={lead} />}
          <DatesPanel orgId={orgId} orgSlug={orgSlug} lead={lead} today={today} initialItems={calendarItems} />
          {/* LeadVendorsClient hard-codes its KpiBand to `grid-cols-3` with a
              max-[420px] escape hatch — a VIEWPORT query, which never fires when
              the viewport is wide and only the COLUMN is narrow. In the rail
              that band gets ~103px of content per tile (1152 max-w − 48 padding
              → 208/track → 432 for col-span-2 → 400 inside CardContent → 126.7
              per track → 103 inside the tile's p-3), and a 20px semibold
              tabular-nums "$12,500.00" does not fit: grid-cols-3 is
              minmax(0,1fr), so the figure overflows rather than widening its
              track. Overridden at the CALL SITE because the Vendors module is
              main's file and not this branch's to edit.

              No `min-[1400px]` restore: the page is `max-w-6xl`, so the rail is
              432px at EVERY viewport above 1200 — a wider window never buys
              those tiles a single pixel. Owed follow-up on the Vendors module:
              make that band container-driven (@container) instead of
              viewport-driven, then this override can go. */}
          <div className="[&_[data-slot=kpi-band]]:grid-cols-1">
            <LeadVendorsClient orgId={orgId} leadId={lead.id} vendors={vendors} />
          </div>
        </aside>
      </div>

      <QuickFactDialog orgId={orgId} leadId={lead.id} fact={quickFact} onClose={() => setQuickFact(null)} />

      {/* A SECOND MarkLostDialog instance, not a shared one: the header's copy
          lives inside OpportunityActionsMenu, which exposes no way to open it
          from out here. Both are controlled and mutually exclusive in practice,
          and a controlled-closed dialog renders nothing, so there is never more
          than one in the DOM. Collapse the two if the menu ever lifts its
          `lostOpen` state into a prop. */}
      <MarkLostDialog
        orgId={orgId}
        leadId={lead.id}
        onDone={() => router.refresh()}
        open={lostOpen}
        onOpenChange={setLostOpen}
      />
    </div>
  )
}
