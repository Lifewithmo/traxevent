'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { setLeadStage } from '@/actions/leads'
import { OPEN_STAGES, LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
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
  openCount: number
  openValue: number
  monthly: ReturnType<typeof closedThisMonth>
  customers?: Customer[]
}

const money = (n: number) => `$${n.toLocaleString()}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

// The board only offers open stages plus Closed won; losing happens on the
// opportunity page where a reason is captured.
const BOARD_STAGES: LeadStage[] = [...OPEN_STAGES, 'closed_won']

const mono11 = {
  color: 'color-mix(in oklab, var(--muted-foreground) 70%, var(--foreground))',
} as const

export function PipelineBoardView({
  orgId, orgSlug, groups, openCount, openValue, monthly, customers,
}: PipelineBoardViewProps) {
  const router = useRouter()
  const [rows, setRows] = useState<PipelineRow[]>(
    () => [...groups.needs_attention, ...groups.waiting, ...groups.active]
  )
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null)
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setActionsSlot(document.getElementById('tx-pipeline-actions'))
  }, [])

  async function handleStageChange(row: PipelineRow, newStage: LeadStage) {
    if (newStage === row.lead.stage) return
    setError(null)
    const prev = rows
    setRows((p) => newStage === 'closed_won'
      ? p.filter((r) => r.lead.id !== row.lead.id)
      : p.map((r) => (r.lead.id === row.lead.id ? { ...r, lead: { ...r.lead, stage: newStage } } : r)))
    try {
      await setLeadStage(orgId, row.lead.id, newStage)
      if (newStage === 'closed_won') {
        router.push(`/${orgSlug}/leads/${row.lead.id}?convert=1`)
      } else {
        // Reconcile health accents/sentences, which the optimistic update above
        // doesn't recompute (it only patches the stage).
        router.refresh()
      }
    } catch (err: unknown) {
      setRows(prev)
      setError(err instanceof Error ? err.message : 'Failed to move opportunity')
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
    <div className="p-6 space-y-6">
      {actionsSlot && createPortal(
        <>
          <Link href={`/${orgSlug}/leads`} className="text-sm underline-offset-4 hover:underline">
            List view
          </Link>
          <Button variant="outline" onClick={() => setIntakeOpen((v) => !v)}>Intake link</Button>
          {!creating && (
            <Button onClick={() => { setCreating(true); setError(null) }}>New opportunity</Button>
          )}
        </>,
        actionsSlot
      )}

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <NewOpportunityForm orgId={orgId} open={creating} onClose={() => setCreating(false)} customers={customers} />

      <IntakeLinkCard orgId={orgId} open={intakeOpen} onClose={() => setIntakeOpen(false)} />

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${OPEN_STAGES.length}, minmax(0, 1fr))` }}
      >
        {OPEN_STAGES.map((stage) => {
          const cards = rows.filter((r) => r.lead.stage === stage)
          const value = cards.reduce((s, r) => s + (r.lead.estimated_value ?? 0), 0)
          return (
            <div key={stage} className="min-w-0 flex flex-col">
              <div
                className="flex items-center justify-between px-1 pb-2"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <h2
                  className="font-mono text-[11px] font-semibold uppercase tracking-[.04em]"
                  style={mono11}
                >
                  {LEAD_STAGE_LABELS[stage]}
                </h2>
                <span className="text-[11px] tabular-nums text-muted-foreground">{`${cards.length} · ${money(value)}`}</span>
              </div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage) }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => handleDrop(e, stage)}
                className="flex-1 space-y-2 overflow-y-auto pt-2 transition-colors duration-[120ms]"
                style={{
                  maxHeight: 'calc(100vh - 320px)',
                  overscrollBehavior: 'contain',
                  background: dragOverStage === stage ? 'var(--muted)' : undefined,
                }}
              >
                {cards.map((row) => {
                  const { lead } = row
                  const subtitle = [
                    lead.event_type,
                    lead.event_date ? shortDate(lead.event_date) : null,
                  ].filter(Boolean).join(' · ')
                  const title = opportunityTitle(lead)
                  return (
                    <article
                      key={lead.id}
                      role="article"
                      aria-label={`${title}, stage ${LEAD_STAGE_LABELS[stage]}. Use arrow keys to move stage.`}
                      tabIndex={0}
                      draggable
                      data-health={row.health}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', lead.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight') { e.preventDefault(); handleArrowMove(row, 1) }
                        if (e.key === 'ArrowLeft') { e.preventDefault(); handleArrowMove(row, -1) }
                      }}
                      className="rounded-md bg-card focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '10px 12px',
                        cursor: 'grab',
                      }}
                    >
                      <Link href={`/${orgSlug}/leads/${lead.id}`} className="block space-y-1">
                        <p
                          className="flex items-center gap-1.5 truncate text-[13px] font-semibold tracking-[-.005em]"
                        >
                          {row.health === 'needs_attention' && (
                            <span
                              aria-hidden
                              className="shrink-0 rounded-full bg-destructive"
                              style={{ height: 5, width: 5 }}
                            />
                          )}
                          <span className="truncate">{title}</span>
                        </p>
                        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
                        <p className={`truncate text-xs ${row.health === 'needs_attention' ? 'text-destructive' : 'text-muted-foreground'}`}>{row.statusLine}</p>
                      </Link>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <StageChip
                          stage={lead.stage}
                          ariaContext={title}
                          onStage={(next) => handleStageChange(row, next)}
                          onMarkLost={() => router.push(`/${orgSlug}/leads/${lead.id}?focus=lost`)}
                        />
                        {lead.estimated_value != null && (
                          <span className="text-xs font-semibold tabular-nums">{money(lead.estimated_value)}</span>
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

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <p className="text-xs text-muted-foreground">
          {`${openCount} open · ${money(openValue)} · ${monthly.wonCount} booked this month`}
        </p>
        <ClosedMonthSummary orgSlug={orgSlug} monthly={monthly} />
      </div>
    </div>
  )
}
