'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/lib/utils'
import { nudgeProposal } from '@/actions/nudge'
import { setLeadStage } from '@/actions/leads'
import { OPEN_STAGES, LEAD_STAGE_LABELS, LOST_REASON_LABELS, opportunityTitle } from '@/lib/leads'
import { STAGE_TONE, money, shortDate, type Tone } from '@/lib/pipeline-presentation'
import type { PipelineGroups, PipelineRow, closedThisMonth } from '@/lib/pipeline-view'
import type { CapacityDay } from '@/lib/capacity/capacity'
import type { Customer, Lead, LeadStage } from '@/lib/types'
import { NewOpportunityForm } from './NewOpportunityForm'
import { IntakeLinkCard } from './IntakeLinkCard'
import { ClosedMonthSummary } from './ClosedMonthSummary'
import { StageChip } from './StageChip'

interface PipelineListClientProps {
  orgId: string
  orgSlug: string
  groups: PipelineGroups
  closed: Lead[]
  openCount: number
  monthly: ReturnType<typeof closedThisMonth>
  customers?: Customer[]
  // Business-tier org with ≥1 active venue unit: the create form offers the
  // offsite / on-site delivery toggle. Computed on the server (page.tsx) so the
  // client never queries the org's plan or units. Undefined ⇒ hidden.
  showDeliveryMode?: boolean
}

/*
  ONE WORD FOR ONE QUANTITY. `groups.needs_attention.length` reaches the operator
  three times inside ~80px of each other on /leads: the KPI tile, this tab, and
  the group rule below it. It used to do so under three different names — "Needs
  action", "Needs a move", "Needs attention" — which reads as three queues. The
  health model's own word is `needs_attention` (lib/pipeline-view), so that is
  the word everywhere, including this key.
*/
type Tab = 'needs_attention' | 'open' | 'closed'

// Advance sequence: open stages in order, then Closed Won — same source of
// truth as the board's StageChip menu (spec §10.2).
const ADVANCE_STAGES: LeadStage[] = [...OPEN_STAGES, 'closed_won']

function nextStage(stage: LeadStage): LeadStage | null {
  const idx = ADVANCE_STAGES.indexOf(stage)
  if (idx === -1 || idx + 1 >= ADVANCE_STAGES.length) return null
  return ADVANCE_STAGES[idx + 1]
}

const MONEY_CLASS = 'text-sm font-medium tabular-nums text-[var(--money-green)]'

/**
 * The book-by urgency chip — the row's DOMINANT time cue (spec: increment 1).
 *
 * The pipeline now ranks by the event deadline, not touch-staleness, so the row
 * has to SAY what deadline it is racing: the event date, the real book-by date
 * (`event − prep_lead_days`, computed in buildPipelineRows), and how long is
 * left. The tone escalates to `alert` inside the prep window (`<= 7` days to the
 * book-by) and stays there once it is past due; further out it is a quiet
 * `neutral` note so a calm pipeline does not read as all-alarm.
 *
 * Returns null for a lead with no `event_date` — those carry none of the radar
 * datums, sort to the no-date tail, and render no chip at all (a chip that said
 * "no date" would be louder than the nothing it describes).
 *
 * ONE date format: `shortDate`, the module's single date vocabulary
 * (pipeline-presentation.ts), never a hand-rolled `new Date(ymd)` slice — the
 * same rule the countdown, the board card and the KPI band already follow.
 */
export function bookByChip(row: PipelineRow): { text: string; tone: Tone } | null {
  if (row.eventDate == null || row.bookByDate == null || row.daysToBookBy == null) return null
  const d = row.daysToBookBy
  const remaining = d < 0 ? `${-d}d past due` : d === 0 ? 'due today' : `${d}d left`
  return {
    text: `Event ${shortDate(row.eventDate)} · book by ${shortDate(row.bookByDate)} · ${remaining}`,
    tone: d <= 7 ? 'alert' : 'neutral',
  }
}

/**
 * The over-capacity badge copy (capacity mode only — a business-tier org with
 * configured units; spec increment 1). Where increment 1 painted a bare binary
 * "Date conflict — <date>", a resource-aware org has a DENOMINATOR, so the pill
 * shows the pair that matters: how many events want the resource vs how many are
 * available. "3 events · 2 carts" makes "I'm one over" read at a glance (Tufte /
 * Few — the numbers are the signal), where a flag only said "something's wrong".
 *
 * WHICH kind it names: only the kind(s) that actually breached (demand > supply)
 * — a spare cart is not the story on a day the ROOMS ran out. If both breach,
 * lead with the larger overage (demand − supply), the sharper shortfall. mobile
 * → "carts", venue → "rooms"; `demand` is that kind's own demand (all bookable
 * for mobile, on-site only for venue), so venue reads "N events" meaning the
 * on-site ones. ONE date format: `shortDate`, the module's single vocabulary.
 *
 * Returns null when the day is not actually over (defensive — the caller already
 * gates on `overCapacity?.over`, but a `detail` with no breach would otherwise
 * pick a non-breaching kind and print a contradiction).
 */
export function overCapacityChip(cap: CapacityDay, eventDate?: string): string | null {
  const breaches = cap.detail
    .filter((d) => d.demand > d.supply)
    .sort((a, b) => b.demand - b.supply - (a.demand - a.supply))
  const worst = breaches[0]
  if (!worst) return null
  const noun = worst.kind === 'venue' ? 'room' : 'cart'
  const events = `${worst.demand} event${worst.demand === 1 ? '' : 's'}`
  const units = `${worst.supply} ${noun}${worst.supply === 1 ? '' : 's'}`
  return `Over capacity — ${events} · ${units} (${shortDate(eventDate ?? cap.date)})`
}

/**
 * A group's rule, carrying the two numbers the operator already paid to compute:
 * how many opportunities are in the bucket and what they are worth. R2 — before
 * this the summed value was computed nowhere and the header was a bare word.
 * The count stays quiet prose; the money is the figure.
 *
 * ZERO POLICY (one for the whole module): a COMPUTED ROLLUP always renders,
 * `$0` included — the board's column headers and every KPI tile already do, and
 * a header that hides its sum at zero reads as "not computed" rather than
 * "nothing here yet". Only an UNSET per-record estimate is not a figure at all;
 * that one gets the "Price it" affordance below.
 *
 * AND THE COUNT AND THE SUM DO NOT COVER THE SAME ROWS. The count is every row;
 * the sum is only the rows carrying an estimate — the rest render "Price it"
 * precisely because theirs is unset. Silent, "3 opportunities · $4,500" read as
 * though $4,500 covered all three, and a group where nobody has priced anything
 * read as "$0", which is a wrong figure rather than an empty one. So the gap is
 * named: the trailing "· 2 unpriced" is what turns that $0 into a to-do.
 */
function GroupHeader({ label, rows, alert }: { label: string; rows: PipelineRow[]; alert?: boolean }) {
  const value = rows.reduce((s, r) => s + (r.lead.estimated_value ?? 0), 0)
  const unpriced = rows.filter((r) => r.lead.estimated_value == null).length
  return (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border pb-1.5">
      <h2 className={`text-sm font-semibold ${alert ? 'text-destructive' : ''}`}>{label}</h2>
      <p className="text-xs text-muted-foreground">
        {rows.length} opportunit{rows.length === 1 ? 'y' : 'ies'}
        {' · '}<span className={MONEY_CLASS}>{money(value)}</span>
        {unpriced > 0 && ` · ${unpriced} unpriced`}
      </p>
    </div>
  )
}

export function PipelineListClient({
  orgId, orgSlug, groups, closed, openCount, monthly, customers, showDeliveryMode,
}: PipelineListClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('open')
  const [creating, setCreating] = useState(false)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [nudging, setNudging] = useState<string | null>(null)
  /*
    Lead id → the move that row is still travelling on: the stage the server
    last reported (`from`) and the stage the operator sent it to (`to`).

    A MAP KEYED BY ROW, not one slot: a single slot could only ever describe one
    row — start row B while row A is still writing and A's "Moving…" label
    vanished and its button re-enabled mid-write, then A's cleanup cleared B's
    mark too.

    AND `from`, not a bare "is writing" flag, because the write resolving is NOT
    the end of the move. `router.refresh()` is fire-and-forget; for the whole RSC
    round trip (300ms–1.5s on this force-dynamic page — the same request also
    writes an activity entry) the row still renders the STALE prop stage. Clear
    on the promise and the advance button re-arms still reading "Move to
    Consultation", and the same-stage early return below compares against that
    stale stage, so a second click fires a second `setLeadStage` — which logs an
    activity entry on EVERY call (actions/leads.ts:112). Two identical
    "Stage → consultation" rows on the timeline, and for closed_won a second
    `?convert=1` push. So the row stays marked until the SERVER's stage moves off
    `from`. Any new payload re-arms it, including one that disagrees with `to`,
    so a lost race cannot strand the row at "Moving…" forever.
  */
  const [moving, setMoving] = useState<Record<string, { from: LeadStage; to: LeadStage }>>({})
  const [error, setError] = useState<string | null>(null)
  // Not an error: the one case the guard below refuses. Rendered in the same
  // live region so a refused click is never silent.
  const [notice, setNotice] = useState<string | null>(null)
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setActionsSlot(document.getElementById('tx-pipeline-actions'))
  }, [])

  async function handleNudge(row: PipelineRow) {
    setError(null)
    setNudging(row.lead.id)
    try {
      await nudgeProposal(orgId, row.lead.id)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to nudge')
    } finally {
      setNudging(null)
    }
  }

  /** The stage a row is still travelling to, or null once the props have moved. */
  function movingTo(lead: Lead): LeadStage | null {
    const move = moving[lead.id]
    return move && lead.stage === move.from ? move.to : null
  }

  /*
    Mirrors `handleNudge` above, which this file already got right. Nothing on
    this surface changes for the whole round trip — no optimistic move, unlike
    the board — so an un-guarded advance button is an invitation to click twice
    while waiting. `setLeadStage` writes an activity-log entry on EVERY call
    (actions/leads.ts:106-116), so a double click stamped two identical
    "Stage -> closed_won" entries on the timeline and fired `?convert=1` twice.

    The guard is PER ROW, matching the per-row `disabled` on the advance button.
    A global one (`if (moving) return`) disagreed with the UI it was paired
    with: row B's button stayed enabled and its stage menu still opened while
    row A was writing, and clicking either did nothing at all — no call, no
    error, no label, nothing in the live region. Other rows now genuinely work;
    the one refusal left — a second stage change on the SAME row, reachable
    through the row's stage menu, which the kit's StageChip cannot be disabled
    from the outside — says so out loud.

    NO `finally`, deliberately. The one that used to sit here did two wrong
    things: it re-armed the row the instant the PROMISE resolved (see the
    `moving` comment — the refresh-lag window is the rest of the duplicate-write
    path), and it called `setNotice(null)`, wiping the refusal the guard below
    had just raised. The notice is global while `moving` is per row, so row B's
    completing move erased row A's refusal too, and the operator was left looking
    at a deal in Consultation, having explicitly picked Proposal, with nothing on
    screen saying why. The notice now survives until the operator's next move.
  */
  async function handleStageChange(row: PipelineRow, newStage: LeadStage) {
    if (newStage === row.lead.stage) return
    if (movingTo(row.lead)) {
      setNotice(`${opportunityTitle(row.lead)} is still moving — wait for that change to land.`)
      return
    }
    /*
      SAME-DAY DOUBLE-BOOK WARN. Capacity is 1 for the solo-operator anchor
      (spec: increment 1), so winning a second job for a date that already
      carries a `closed_won` is very likely a mistake — the operator cannot serve
      both. We warn, we do not block: the deadline radar is advisory, and a real
      "yes, book both" (a partner, a subcontract) must still be reachable.

      The check reads props already in hand — the booked jobs are the
      `closed_won` leads in `closed`, and we scan the open `groups` too so the
      rule holds even if a won deal ever surfaces there. No new data, no query.
      Cancel aborts BEFORE any `setMoving`/`setLeadStage`, so a declined confirm
      leaves the row exactly as it was.
    */
    if (newStage === 'closed_won' && row.lead.event_date) {
      const booked = [
        ...closed,
        ...groups.needs_attention.map((r) => r.lead),
        ...groups.waiting.map((r) => r.lead),
        ...groups.active.map((r) => r.lead),
      ].some(
        (l) =>
          l.id !== row.lead.id &&
          l.stage === 'closed_won' &&
          l.event_date === row.lead.event_date,
      )
      if (booked && !window.confirm(
        `Another job is already booked for ${shortDate(row.lead.event_date)}. Book this one too?`,
      )) {
        return
      }
    }
    setError(null)
    setNotice(null)
    setMoving((m) => ({ ...m, [row.lead.id]: { from: row.lead.stage, to: newStage } }))
    try {
      await setLeadStage(orgId, row.lead.id, newStage)
      if (newStage === 'closed_won') {
        router.push(`/${orgSlug}/leads/${row.lead.id}?convert=1`)
      } else {
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to move opportunity')
      // Re-arm ON THE FAILURE PATH ONLY — nothing else is coming. Without this
      // a refused move leaves the advance button stuck reading "Moving…" and
      // disabled forever. The success path is re-armed by the refreshed props.
      setMoving((m) => {
        const next = { ...m }
        delete next[row.lead.id]
        return next
      })
    }
  }

  function renderRow(row: PipelineRow) {
    const { lead } = row
    const title = opportunityTitle(lead)
    const next = nextStage(lead.stage)
    const needsAttention = row.health === 'needs_attention'
    const isMoving = movingTo(lead) !== null
    const chip = bookByChip(row)
    return (
      <div
        key={lead.id}
        data-row={lead.id}
        // R8: the identity block and the five-control cluster are two wrapping
        // flex children, not one `shrink-0` row — below `md` the cluster drops
        // to its own line instead of squeezing the title to nothing.
        className={[
          'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-l-2 py-2.5 pr-1 pl-3',
          'border-b-border/60',
          needsAttention ? 'border-l-destructive' : 'border-l-transparent',
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar name={lead.name} size="sm" />
          <div className="min-w-0">
            {/*
              Row titles stay `text-foreground` rather than `text-primary`: this
              is the kit's own record-row treatment (related-record-card.tsx:17)
              and a queue where every title is copper has no hierarchy left.
              Copper is spent on the affordances below (Price it, Events).
            */}
            <Link
              href={`/${orgSlug}/leads/${lead.id}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {title}
            </Link>
            <p className={`truncate text-xs ${needsAttention ? 'text-destructive' : 'text-muted-foreground'}`}>
              {row.statusLine}
            </p>
            {/*
              The deadline radar, in the IDENTITY block rather than the action
              cluster: the pipeline now ranks by this deadline, so it is primary
              content, not a trailing badge. The task-countdown pill on the right
              (a next-step due date, a different clock) is now the secondary cue.
              A same-day booking conflict leads — it is the loudest signal the
              radar carries — then the book-by urgency chip.
            */}
            {(row.conflict || chip) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {/*
                  max-w-full + whitespace-normal so a long chip WRAPS instead of
                  clipping: the full book-by chip ("Event … · book by … · Nd
                  left") is ~317px and overruns a 375px phone (the avatar eats
                  ~76px), silently cutting "…4d left". flex-wrap only breaks
                  BETWEEN pills; a single over-wide pill needs to wrap its own
                  text. Harmless on desktop — the text fits on one line there.
                  The capacity pill is longer still ("Over capacity — 3 events ·
                  2 carts (Sep 5)"), so it leans on the same wrap.
                */}
                {/*
                  Capacity mode wins over the base badge: when `overCapacity.over`
                  is set the org has a real denominator, so it gets the numbered
                  "Over capacity — N events · M carts" pill, NOT the binary "Date
                  conflict". base/solo orgs never carry `overCapacity`, so they
                  fall through to the increment-1 "Date conflict — <date>" copy
                  BYTE-FOR-BYTE (the non-negotiable backstop). Both are `alert`.
                */}
                {row.overCapacity?.over ? (
                  (() => {
                    const text = overCapacityChip(row.overCapacity, row.eventDate)
                    return text
                      ? <StatusPill tone="alert" className="max-w-full whitespace-normal">{text}</StatusPill>
                      : null
                  })()
                ) : row.conflict && row.eventDate ? (
                  <StatusPill tone="alert" className="max-w-full whitespace-normal">Date conflict — {shortDate(row.eventDate)}</StatusPill>
                ) : null}
                {chip && <StatusPill tone={chip.tone} className="max-w-full whitespace-normal">{chip.text}</StatusPill>}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StageChip
            stage={lead.stage}
            ariaContext={title}
            onStage={(s) => handleStageChange(row, s)}
            onMarkLost={() => router.push(`/${orgSlug}/leads/${lead.id}?focus=lost`)}
          />
          {lead.estimated_value != null ? (
            <span className={MONEY_CLASS}>{money(lead.estimated_value)}</span>
          ) : (
            // R6: an unset figure offers the next action, never an em-dash —
            // and the label has to name the action this control PERFORMS. This
            // one navigates: there is no `?focus=value` query, because the
            // opportunity page honours `convert`, `focus=task` and `focus=lost`
            // (OpportunityDetailClient.tsx:202, 208) and nothing else, so a
            // query it ignores would be a control that silently does nothing.
            // Labelled "+ Add value" it promised an add and delivered a page —
            // the operator then had to find a SECOND "+ Add value" on the
            // opportunity's KPI band, which is the one that really does add.
            // "Price it" is the errand; the band's "+ Add value" is the edit.
            <Link
              href={`/${orgSlug}/leads/${lead.id}`}
              className={cn(buttonVariants({ variant: 'link', size: 'xs' }), 'px-0')}
            >
              Price it
            </Link>
          )}
          {row.countdown && <StatusPill tone={row.countdown.tone}>{row.countdown.text}</StatusPill>}
          {row.quickAction === 'set_next_step' && (
            <Link
              href={`/${orgSlug}/leads/${lead.id}?focus=task`}
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              Set next step
            </Link>
          )}
          {row.quickAction === 'nudge' && (
            <Button
              size="sm"
              onClick={() => handleNudge(row)}
              disabled={nudging === lead.id || !lead.email}
            >
              {nudging === lead.id ? 'Nudging…' : 'Nudge'}
            </Button>
          )}
          {next && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStageChange(row, next)}
              disabled={isMoving}
            >
              {isMoving ? 'Moving…' : `Move to ${LEAD_STAGE_LABELS[next]}`}
            </Button>
          )}
        </div>
      </div>
    )
  }

  function renderClosedRow(lead: Lead) {
    return (
      <div
        key={lead.id}
        data-row={lead.id}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-b-border/60 border-l-2 border-l-transparent py-2.5 pr-1 pl-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar name={lead.name} size="sm" />
          <div className="min-w-0">
            <Link
              href={`/${orgSlug}/leads/${lead.id}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {opportunityTitle(lead)}
            </Link>
            {lead.lost && (
              <p className="truncate text-xs text-muted-foreground">
                Lost — {LOST_REASON_LABELS[lead.lost.reason]}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/*
            Won and lost are the whole point of this tab; one grey label for
            both made them indistinguishable at a glance.
          */}
          <StatusPill tone={STAGE_TONE[lead.stage]}>{LEAD_STAGE_LABELS[lead.stage]}</StatusPill>
          {lead.closed_at && (
            // One date format across the module — `shortDate`, the same helper
            // the board card's subtitle uses, not a raw ISO slice.
            <span className="text-xs tabular-nums text-muted-foreground">
              {shortDate(lead.closed_at.slice(0, 10))}
            </span>
          )}
          {lead.estimated_value != null && (
            // A LOST deal's value is not money earned, so it does not get the
            // money/success token. Muted: it is the size of what walked away.
            <span
              className={lead.stage === 'closed_lost'
                ? 'text-sm font-medium tabular-nums text-muted-foreground'
                : MONEY_CLASS}
            >
              {money(lead.estimated_value)}
            </span>
          )}
        </div>
      </div>
    )
  }

  const openEmpty = groups.needs_attention.length + groups.waiting.length + groups.active.length === 0

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'needs_attention', label: `Needs attention (${groups.needs_attention.length})` },
    { key: 'open', label: `All open (${openCount})` },
    { key: 'closed', label: `Closed (${closed.length})` },
  ]

  return (
    // R3: the rows are `justify-between`, so an uncapped column parks the stage
    // chip and the money 800px from the title on a wide monitor. `max-w-6xl`
    // matches the shipped Clients cockpit (ClientCockpit.tsx:51) and the
    // opportunity spine, so the three Pipeline surfaces share one frame.
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {actionsSlot && createPortal(
        <>
          <Link href={`/${orgSlug}/leads?view=board`} className="text-sm underline-offset-4 hover:underline">
            Board view
          </Link>
          <Button variant="outline" onClick={() => setIntakeOpen((v) => !v)}>Intake link</Button>
          <Button onClick={() => { setCreating(true); setError(null) }}>New opportunity</Button>
        </>,
        actionsSlot
      )}

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      </div>

      {/*
        R1/R3: the create form used to mount INLINE and shove the whole pipeline
        a screen and a half down the page. It is wrapped in the kit Dialog HERE,
        at the call site, because the component itself is shared with the
        shipped Clients cockpit and must not change. The `[&_...]` resets strip
        its Card chrome so the dialog does not render a box inside a box.
        (IntakeLinkCard is NOT wrapped — it already owns a Dialog internally;
        a second one would nest two roots and one Escape would close both.)
      */}
      <Dialog open={creating} onOpenChange={(next) => { if (!next) setCreating(false) }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogTitle className="sr-only">New opportunity</DialogTitle>
          <div className="[&_[data-slot=card-content]]:px-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:shadow-none">
            <NewOpportunityForm orgId={orgId} open={creating} onClose={() => setCreating(false)} customers={customers} showDeliveryMode={showDeliveryMode} />
          </div>
        </DialogContent>
      </Dialog>

      <IntakeLinkCard orgId={orgId} open={intakeOpen} onClose={() => setIntakeOpen(false)} />

      {/* R8: three tab buttons wrap instead of overflowing a narrow viewport. */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={activeTab === t.key ? 'default' : 'outline'}
            size="sm"
            aria-pressed={activeTab === t.key}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {activeTab === 'needs_attention' && (
        groups.needs_attention.length === 0 ? (
          <EmptyState
            className="py-12"
            title="Nothing needs attention"
            description="Every open opportunity has a next step or a live follow-up date."
            action={
              <Button variant="outline" size="sm" onClick={() => setActiveTab('open')}>
                See all open
              </Button>
            }
          />
        ) : (
          <section>
            <GroupHeader label="Needs attention" rows={groups.needs_attention} alert />
            {groups.needs_attention.map(renderRow)}
          </section>
        )
      )}

      {activeTab === 'open' && (
        openEmpty ? (
          // The single highest-value CTA slot in the module: an operator with an
          // empty pipeline needs an opportunity, not a sentence.
          <EmptyState
            className="py-12"
            icon={<Plus className="size-4" />}
            title="No open opportunities"
            description="Inquiries from your intake link land here. Add one yourself to get started."
            action={
              <Button size="sm" onClick={() => { setCreating(true); setError(null) }}>
                New opportunity
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {groups.needs_attention.length > 0 && (
              <section>
                <GroupHeader label="Needs attention" rows={groups.needs_attention} alert />
                {groups.needs_attention.map(renderRow)}
              </section>
            )}
            {groups.waiting.length > 0 && (
              <section>
                <GroupHeader label="Waiting on them" rows={groups.waiting} />
                {groups.waiting.map(renderRow)}
              </section>
            )}
            {groups.active.length > 0 && (
              <section>
                <GroupHeader label="Moving" rows={groups.active} />
                {groups.active.map(renderRow)}
              </section>
            )}
          </div>
        )
      )}

      {activeTab === 'closed' && (
        closed.length === 0 ? (
          <EmptyState
            className="py-12"
            title="Nothing closed yet"
            description="Won and lost opportunities land here once you close them."
            action={
              <Button variant="outline" size="sm" onClick={() => setActiveTab('open')}>
                See all open
              </Button>
            }
          />
        ) : (
          <div>{closed.map(renderClosedRow)}</div>
        )
      )}

      <div className="border-t border-border pt-4">
        <ClosedMonthSummary orgSlug={orgSlug} monthly={monthly} />
      </div>
    </div>
  )
}
