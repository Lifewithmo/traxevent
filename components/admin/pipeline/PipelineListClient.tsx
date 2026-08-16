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
import { STAGE_TONE, money, shortDate } from '@/lib/pipeline-presentation'
import type { PipelineGroups, PipelineRow, closedThisMonth } from '@/lib/pipeline-view'
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
}

type Tab = 'needs_move' | 'open' | 'closed'

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
 * A group's rule, carrying the two numbers the operator already paid to compute:
 * how many opportunities are in the bucket and what they are worth. R2 — before
 * this the summed value was computed nowhere and the header was a bare word.
 * The count stays quiet prose; the money is the figure.
 *
 * ZERO POLICY (one for the whole module): a COMPUTED ROLLUP always renders,
 * `$0` included — the board's column headers and every KPI tile already do, and
 * a header that hides its sum at zero reads as "not computed" rather than
 * "nothing here yet". Only an UNSET per-record estimate is not a figure at all;
 * that one gets the "+ Add value" affordance below.
 */
function GroupHeader({ label, rows, alert }: { label: string; rows: PipelineRow[]; alert?: boolean }) {
  const value = rows.reduce((s, r) => s + (r.lead.estimated_value ?? 0), 0)
  return (
    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border pb-1.5">
      <h2 className={`text-sm font-semibold ${alert ? 'text-destructive' : ''}`}>{label}</h2>
      <p className="text-xs text-muted-foreground">
        {rows.length} opportunit{rows.length === 1 ? 'y' : 'ies'}
        {' · '}<span className={MONEY_CLASS}>{money(value)}</span>
      </p>
    </div>
  )
}

export function PipelineListClient({
  orgId, orgSlug, groups, closed, openCount, monthly, customers,
}: PipelineListClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('open')
  const [creating, setCreating] = useState(false)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [nudging, setNudging] = useState<string | null>(null)
  /*
    The lead ids whose `setLeadStage` write is in flight — a LIST, not one slot.
    A single slot could only ever describe one row: start row B while row A is
    still writing and A's "Moving…" label vanished and its button re-enabled
    mid-write, then A's `finally` cleared B's mark too.
  */
  const [moving, setMoving] = useState<string[]>([])
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
  */
  async function handleStageChange(row: PipelineRow, newStage: LeadStage) {
    if (newStage === row.lead.stage) return
    if (moving.includes(row.lead.id)) {
      setNotice(`${opportunityTitle(row.lead)} is still moving — wait for that change to land.`)
      return
    }
    setError(null)
    setNotice(null)
    setMoving((m) => [...m, row.lead.id])
    try {
      await setLeadStage(orgId, row.lead.id, newStage)
      if (newStage === 'closed_won') {
        router.push(`/${orgSlug}/leads/${row.lead.id}?convert=1`)
      } else {
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to move opportunity')
    } finally {
      // Clearing this is what re-arms the row: without it the advance button is
      // stuck reading "Moving…" and disabled forever after a rejected move.
      setMoving((m) => m.filter((id) => id !== row.lead.id))
      setNotice(null)
    }
  }

  function renderRow(row: PipelineRow) {
    const { lead } = row
    const title = opportunityTitle(lead)
    const next = nextStage(lead.stage)
    const needsAttention = row.health === 'needs_attention'
    const isMoving = moving.includes(lead.id)
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
              Copper is spent on the affordances below (+ Add value, Events).
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
            // R6: an unset figure offers the next action, never an em-dash. No
            // `?focus=value` query — the opportunity page honours `convert`,
            // `focus=task` and `focus=lost` (OpportunityDetailClient.tsx:202,
            // 208) and nothing else, so a query it ignores would be a control
            // that silently does nothing. The rail's inline "+ Add" facts are
            // one click away on arrival.
            <Link
              href={`/${orgSlug}/leads/${lead.id}`}
              className={cn(buttonVariants({ variant: 'link', size: 'xs' }), 'px-0')}
            >
              + Add value
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
    { key: 'needs_move', label: `Needs a move (${groups.needs_attention.length})` },
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
            <NewOpportunityForm orgId={orgId} open={creating} onClose={() => setCreating(false)} customers={customers} />
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

      {activeTab === 'needs_move' && (
        groups.needs_attention.length === 0 ? (
          <EmptyState
            className="py-12"
            title="Nothing needs a move"
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
