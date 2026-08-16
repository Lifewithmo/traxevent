'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { setLeadStage } from '@/actions/leads'
import { cn } from '@/lib/utils'
import { OPEN_STAGES, LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
import { money, shortDate } from '@/lib/pipeline-presentation'
import type { PipelineGroups, PipelineRow, closedThisMonth } from '@/lib/pipeline-view'
import type { Customer, LeadStage } from '@/lib/types'
import { ClosedMonthSummary } from './ClosedMonthSummary'
import { StageChip } from './StageChip'
import { NewOpportunityForm } from './NewOpportunityForm'
import { IntakeLinkCard } from './IntakeLinkCard'

interface PipelineBoardViewProps {
  orgId: string
  orgSlug: string
  groups: PipelineGroups
  monthly: ReturnType<typeof closedThisMonth>
  customers?: Customer[]
}

// The board only offers open stages plus Closed won; losing happens on the
// opportunity page where a reason is captured.
const BOARD_STAGES: LeadStage[] = [...OPEN_STAGES, 'closed_won']

const mono11 = {
  color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))',
} as const

function flatten(groups: PipelineGroups): PipelineRow[] {
  // Order matters: needs_attention first, then waiting, then active — each
  // already sorted oldest-touch-first by buildPipelineRows. The empty-column CTA
  // below takes the FIRST match in a stage, so it offers the most neglected deal.
  return [...groups.needs_attention, ...groups.waiting, ...groups.active]
}

/**
 * One in-flight `setLeadStage` call. The OBJECT IDENTITY is the per-call token:
 * the map holds the newest call's ticket for a lead, so an older call that
 * settles later can tell — by identity, not by lead id — that it no longer owns
 * the card. See the `finally` in handleStageChange.
 */
interface PendingMove { stage: LeadStage }

/**
 * Re-apply every move whose server write is still in flight on top of a fresh
 * server payload.
 *
 * Without this, two overlapping drags fight each other: card A's move resolves
 * and fires `router.refresh()`; during that RSC round trip (300ms–1.5s here,
 * since the same request also writes an activity log) the operator drags card B;
 * then A's payload lands — computed BEFORE B moved — and the props→state sync
 * replaces the whole array, snapping B back to its old column while B's own
 * write is still running. B's write then lands, its refresh corrects it, and the
 * card visibly teleports back and forth.
 */
function applyPending(base: PipelineRow[], pending: Map<string, PendingMove>): PipelineRow[] {
  if (pending.size === 0) return base
  const out: PipelineRow[] = []
  for (const row of base) {
    const move = pending.get(row.lead.id)
    if (move === undefined) { out.push(row); continue }
    // A pending Closed Won removed the card optimistically; a server payload
    // that still lists it must not put it back on the board.
    if (move.stage === 'closed_won') continue
    out.push({ ...row, lead: { ...row.lead, stage: move.stage } })
  }
  return out
}

export function PipelineBoardView({
  orgId, orgSlug, groups, monthly, customers,
}: PipelineBoardViewProps) {
  const router = useRouter()
  const [rows, setRows] = useState<PipelineRow[]>(() => flatten(groups))
  const [syncedFrom, setSyncedFrom] = useState<PipelineGroups>(groups)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null)
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)

  /**
   * Lead id → the NEWEST still-unresolved `setLeadStage` call for that lead.
   * Written beside every optimistic update, cleared in that call's `finally`
   * — but only if that call is still the entry's owner (identity check), or a
   * card dragged twice in a row loses its second move's pending mark the
   * instant the FIRST write settles, and the stale payload snaps it back.
   *
   * A `useState` initialiser rather than `useRef`, and deliberately so: the
   * props→state sync below has to read this DURING RENDER, and this repo's
   * eslint fails the build on `react-hooks/refs` ("Cannot access refs during
   * render") — the same class of rule as the `set-state-in-effect` one that
   * shaped the sync itself. Held this way, its identity never changes and the
   * setter is never called, so it is a stable mutable container and never a
   * render input; only a `handleStageChange` in flight ever writes to it.
   */
  const [pending] = useState(() => new Map<string, PendingMove>())

  /*
    DELIBERATE BEHAVIOUR CHANGE. `rows` used to be seeded from props exactly
    once, with no props→state sync, so the `router.refresh()` below reconciled
    NOTHING: a card kept its pre-move health accent and its stale status sentence
    ("no touch in 11 days") until a full page load. The comment in the move
    handler claimed otherwise, so the bug was invisible in review.

    This is React's render-time state adjustment, not `useEffect(setState)` —
    the repo's eslint fails the build on `react-hooks/set-state-in-effect`, and
    an effect would also paint one frame of stale rows first. The guard keys off
    the `groups` PROP identity (not a derived useMemo value, which is one more
    thing that can change for reasons of its own), so a purely local re-render —
    an optimistic move, a drag highlight — never trips it; only a genuinely new
    server payload does.

    Every in-flight optimistic move is re-applied ON TOP of that payload, because
    a payload rendered before the operator's most recent drag would otherwise
    snap that card back mid-write.
  */
  if (syncedFrom !== groups) {
    setSyncedFrom(groups)
    setRows(applyPending(flatten(groups), pending))
  }

  useEffect(() => {
    setActionsSlot(document.getElementById('tx-pipeline-actions'))
  }, [])

  async function handleStageChange(row: PipelineRow, newStage: LeadStage) {
    if (newStage === row.lead.stage) return
    setError(null)
    // Where the card sat before the optimistic removal, so a rejected Closed Won
    // can be put back exactly where the operator left it.
    const prevIndex = rows.findIndex((r) => r.lead.id === row.lead.id)
    /*
      THIS call's ticket. The map is keyed by lead id, so a card dragged twice
      before the first write resolves has two calls competing for one entry: the
      first one's `finally` used to clear it unconditionally, un-marking a move
      that was still in flight, and the first call's stale refresh payload then
      snapped the card back to the column the SECOND drag had already left. The
      identity comparisons below are what keep the newest call the owner.
    */
    const ticket: PendingMove = { stage: newStage }
    pending.set(row.lead.id, ticket)
    setRows((p) => newStage === 'closed_won'
      ? p.filter((r) => r.lead.id !== row.lead.id)
      : p.map((r) => (r.lead.id === row.lead.id ? { ...r, lead: { ...r.lead, stage: newStage } } : r)))
    try {
      await setLeadStage(orgId, row.lead.id, newStage)
      if (newStage === 'closed_won') {
        router.push(`/${orgSlug}/leads/${row.lead.id}?convert=1`)
      } else {
        // Reconcile health accents/sentences, which the optimistic update above
        // doesn't recompute (it only patches the stage). The sync block at the
        // top of this component is what actually lands the refreshed rows.
        router.refresh()
      }
    } catch (err: unknown) {
      /*
        Roll back THIS CARD ONLY, functionally. Restoring a whole-array snapshot
        taken before the optimistic update threw away anything that landed in
        between: card A's successful move + refresh, then card B's rejection,
        and the snapshot reverted A's column, health accent and sentence too —
        unrecoverably, because `syncedFrom` already equalled that payload, so the
        sync block would never re-apply it.
      */
      // …and only while this call still OWNS the card. A newer move of the same
      // card has already painted its own optimistic stage; rewinding to the one
      // this call started from would drag the card backwards under the
      // operator's hands while that newer write is still running.
      if (pending.get(row.lead.id) === ticket) {
        setRows((p) => {
          if (newStage !== 'closed_won') {
            return p.map((r) => (
              r.lead.id === row.lead.id ? { ...r, lead: { ...r.lead, stage: row.lead.stage } } : r
            ))
          }
          if (p.some((r) => r.lead.id === row.lead.id)) return p
          const next = [...p]
          next.splice(prevIndex < 0 ? next.length : Math.min(prevIndex, next.length), 0, row)
          return next
        })
        // The MESSAGE is inside the ownership guard for the same reason the
        // rollback is. `setError(null)` runs at the START of every call, so a
        // superseded move rejecting after the newer move of that same card had
        // already succeeded left "Permission denied" standing under a card
        // sitting correctly in its new column: the operator was told a move had
        // failed when the one they actually made had landed.
        setError(err instanceof Error ? err.message : 'Failed to move opportunity')
      }
    } finally {
      // Identity, not lead id: a second move of the SAME card replaced this
      // entry, and that move is still in flight.
      if (pending.get(row.lead.id) === ticket) pending.delete(row.lead.id)
    }
  }

  function handleDrop(e: React.DragEvent, stage: LeadStage) {
    e.preventDefault()
    setDragOverStage(null)
    const id = e.dataTransfer.getData('text/plain')
    const row = rows.find((r) => r.lead.id === id)
    if (row) handleStageChange(row, stage)
  }

  function handleArrowMove(row: PipelineRow, direction: 1 | -1) {
    const sequence = BOARD_STAGES
    const idx = sequence.indexOf(row.lead.stage)
    if (idx === -1) return
    const nextIdx = idx + direction
    if (nextIdx < 0 || nextIdx >= sequence.length) return
    handleStageChange(row, sequence[nextIdx])
  }

  return (
    // Same `max-w-6xl` frame as the list surface and the opportunity spine, so
    // toggling list↔board does not shift the module's left edge (R3).
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {actionsSlot && createPortal(
        <>
          <Link href={`/${orgSlug}/leads`} className="text-sm underline-offset-4 hover:underline">
            List view
          </Link>
          <Button variant="outline" onClick={() => setIntakeOpen((v) => !v)}>Intake link</Button>
          <Button onClick={() => { setCreating(true); setError(null) }}>New opportunity</Button>
        </>,
        actionsSlot
      )}

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/*
        Wrapped in the kit Dialog at the CALL SITE — NewOpportunityForm is shared
        with the shipped Clients cockpit and must not change. Inline, it pushed
        the whole board below the fold. IntakeLinkCard is deliberately NOT
        wrapped: it owns a Dialog internally already.
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

      {/*
        R8: three explicit columns that collapse to one below `md`. This was an
        inline `style={{ gridTemplateColumns: repeat(3, …) }}`, which NO media
        query can override — the board was three 100px columns on a phone. Both
        the base and the override are explicit `grid-cols-*`; a bare `grid` with
        only a `md:` rule leaves an implicit `auto` track that overflows.
      */}
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        {OPEN_STAGES.map((stage) => {
          const cards = rows.filter((r) => r.lead.stage === stage)
          const value = cards.reduce((s, r) => s + (r.lead.estimated_value ?? 0), 0)
          // The count covers every card; the sum covers only the priced ones —
          // the rest render "Price it" precisely because theirs is unset. A
          // column of five unpriced deals read "5 deals" over a money-green
          // "$0", which an operator reads as "this stage is worth nothing"
          // rather than "nobody has priced these". Naming the gap makes the $0
          // a to-do instead of a wrong figure. Same rule as the list's
          // GroupHeader (PipelineListClient.tsx:61).
          const unpriced = cards.filter((r) => r.lead.estimated_value == null).length
          // R4: an empty column offered NOTHING before — it rendered blank. The
          // forward move out of an empty stage is to advance the most neglected
          // deal sitting in the stage before it; failing that (Inquiry, or an
          // equally empty predecessor) it is to create one.
          const prevStage = OPEN_STAGES[OPEN_STAGES.indexOf(stage) - 1]
          const candidate = prevStage ? rows.find((r) => r.lead.stage === prevStage) : undefined
          return (
            <div key={stage} data-stage-column={stage} className="flex min-w-0 flex-col">
              <div className="border-b border-border px-1 pb-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2
                    className="font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
                    style={mono11}
                  >
                    {LEAD_STAGE_LABELS[stage]}
                  </h2>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {cards.length} deal{cards.length === 1 ? '' : 's'}
                  </span>
                </div>
                {/* R2: the column header IS this board's stat tile — the stage's
                    worth is the number the operator is here for, so it gets its
                    own line as a figure instead of trailing an 11px grey count. */}
                <p className="text-sm font-semibold tabular-nums text-[var(--money-green)]">
                  {money(value)}
                  {unpriced > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      · {unpriced} unpriced
                    </span>
                  )}
                </p>
              </div>
              <div
                data-stage-dropzone={stage}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverStage(stage)
                }}
                /*
                  `dragleave` fires at the element being LEFT on every internal
                  boundary crossing — dropzone→card, card→card — and bubbles up
                  to here. Clearing unconditionally made the one piece of
                  feedback that says "this column will take the drop" strobe its
                  way across a populated column. `relatedTarget` is where the
                  pointer went; if that is still inside this dropzone, the drag
                  never actually left.
                */
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                  setDragOverStage((s) => (s === stage ? null : s))
                }}
                onDrop={(e) => handleDrop(e, stage)}
                className="flex-1 space-y-2 pt-2 transition-colors duration-[120ms] md:max-h-[70dvh]"
                style={{
                  // Inline, not `overflow-y-auto`, on purpose: StageChip closes
                  // its portalled menu by probing `getComputedStyle(...).overflowY`
                  // on its scrolling ancestors, and an inline declaration is the
                  // one form that probe resolves in EVERY environment — including
                  // jsdom, where the orphaned-popup regression test lives.
                  // Uncapped below `md` (see the md:max-h above) so a stacked
                  // single column is never a nested scroll trap.
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  background: dragOverStage === stage ? 'var(--muted)' : undefined,
                }}
              >
                {cards.length === 0 ? (
                  <EmptyState
                    className="py-8"
                    title={`Nothing in ${LEAD_STAGE_LABELS[stage]}`}
                    description={
                      candidate
                        // The CTA takes the FIRST match in flatten() order —
                        // needs_attention before waiting before active — so it
                        // offers the most NEGLECTED deal, not the oldest one.
                        // The copy has to say what the button does.
                        ? `Drag one across, or advance the most neglected ${LEAD_STAGE_LABELS[prevStage]}.`
                        : 'Drag a card across, or start a new opportunity.'
                    }
                    action={
                      candidate ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="max-w-full"
                          onClick={() => handleStageChange(candidate, stage)}
                        >
                          <span className="truncate">Move {opportunityTitle(candidate.lead)} here</span>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => { setCreating(true); setError(null) }}>
                          New opportunity
                        </Button>
                      )
                    }
                  />
                ) : cards.map((row) => {
                  const { lead } = row
                  const subtitle = [
                    lead.event_type,
                    lead.event_date ? shortDate(lead.event_date) : null,
                  ].filter(Boolean).join(' · ')
                  const title = opportunityTitle(lead)
                  const needsAttention = row.health === 'needs_attention'
                  return (
                    <article
                      key={lead.id}
                      role="article"
                      aria-label={`${title}, stage ${LEAD_STAGE_LABELS[stage]}. Use arrow keys to move stage.`}
                      tabIndex={0}
                      draggable
                      data-health={row.health}
                      onDragStart={(e) => {
                        // Declare the operation, or the browser is free to show
                        // a copy cursor for a move and to accept the card as a
                        // drop on surfaces that only opt into copies.
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', lead.id)
                      }}
                      /*
                        The highlight's safety net. `dragOverStage` is otherwise
                        cleared only by `dragleave` (behind the relatedTarget
                        guard) and by a drop — so a CANCELLED drag (Escape,
                        released over the gutter or outside the window) can leave
                        a column tinted `var(--muted)` until some other column is
                        dragged over, because a browser is not obliged to deliver
                        a final `dragleave` on cancel. `dragend` fires on the
                        SOURCE however the drag ended, which makes this the one
                        event that always arrives.
                      */
                      onDragEnd={() => setDragOverStage(null)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'ArrowRight') { e.preventDefault(); handleArrowMove(row, 1) }
                        if (e.key === 'ArrowLeft') { e.preventDefault(); handleArrowMove(row, -1) }
                      }}
                      className="rounded-md border border-border bg-card px-3 py-2.5 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                      style={{ cursor: 'grab' }}
                    >
                      <div className="flex items-start gap-2">
                        <Avatar name={lead.name} size="sm" />
                        {/*
                          `draggable={false}` on the anchor is load-bearing: an
                          <a> is a drag source in its own right, so a drag that
                          started on the title dragged the URL instead of the
                          card. Off, the browser walks up to this article — the
                          card drags from anywhere, including its title.
                        */}
                        <Link
                          href={`/${orgSlug}/leads/${lead.id}`}
                          draggable={false}
                          className="block min-w-0 flex-1 space-y-0.5"
                        >
                          <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold tracking-[-.005em]">
                            {needsAttention && (
                              <span
                                aria-hidden
                                className="size-[5px] shrink-0 rounded-full bg-destructive"
                              />
                            )}
                            <span className="truncate">{title}</span>
                          </p>
                          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
                          <p className={`truncate text-xs ${needsAttention ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {row.statusLine}
                          </p>
                        </Link>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <StageChip
                            stage={lead.stage}
                            ariaContext={title}
                            onStage={(next) => handleStageChange(row, next)}
                            onMarkLost={() => router.push(`/${orgSlug}/leads/${lead.id}?focus=lost`)}
                          />
                          {/*
                            buildPipelineRows computes a toned Countdown for
                            every waiting and active row and the board THREW IT
                            AWAY: overdue-ness reached the operator only as a
                            date inside the grey status sentence, indistinguish-
                            able at a glance from a task due next week. Same
                            pill, same tone source as the list.
                          */}
                          {row.countdown && (
                            <StatusPill tone={row.countdown.tone}>{row.countdown.text}</StatusPill>
                          )}
                        </div>
                        {lead.estimated_value != null ? (
                          <span className="text-xs font-semibold tabular-nums text-[var(--money-green)]">
                            {money(lead.estimated_value)}
                          </span>
                        ) : (
                          // R6: never a dash — and the label names what this
                          // control DOES. It navigates: no `?focus=value`,
                          // because the opportunity page ignores that query, and
                          // a control that silently does nothing is worse than
                          // the dash it replaced. "+ Add value" promised an add
                          // and delivered a page, leaving the operator to hunt
                          // for the SECOND "+ Add value" on the opportunity's
                          // KPI band — the one that really does add. Same split
                          // as the list row (PipelineListClient.tsx:216).
                          // The kit button SKIN on a real anchor, not
                          // `<Button render={<Link/>}>`: Base UI's Button owns
                          // button semantics and warns (or stamps role="button"
                          // on a link) — see ContactCard.tsx:13.
                          <Link
                            href={`/${orgSlug}/leads/${lead.id}`}
                            draggable={false}
                            className={cn(buttonVariants({ variant: 'link', size: 'xs' }), 'px-0')}
                          >
                            Price it
                          </Link>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-border pt-4">
        <ClosedMonthSummary orgSlug={orgSlug} monthly={monthly} />
      </div>
    </div>
  )
}
