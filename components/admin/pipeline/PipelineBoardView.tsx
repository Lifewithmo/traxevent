'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { setLeadStage } from '@/actions/leads'
import { OPEN_STAGES, LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
import type { PipelineGroups, PipelineRow, closedThisMonth } from '@/lib/pipeline-view'
import type { LeadStage } from '@/lib/types'
import { ClosedMonthSummary } from './ClosedMonthSummary'

interface PipelineBoardViewProps {
  orgId: string
  orgSlug: string
  groups: PipelineGroups
  openCount: number
  openValue: number
  monthly: ReturnType<typeof closedThisMonth>
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

export function PipelineBoardView({
  orgId, orgSlug, groups, openCount, openValue, monthly,
}: PipelineBoardViewProps) {
  const router = useRouter()
  const [rows, setRows] = useState<PipelineRow[]>(
    () => [...groups.needs_attention, ...groups.waiting, ...groups.active]
  )
  const [error, setError] = useState<string | null>(null)

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
    const id = e.dataTransfer.getData('text/plain')
    const row = rows.find((r) => r.lead.id === id)
    if (row) handleStageChange(row, stage)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {`${openCount} open · ${money(openValue)} · ${monthly.wonCount} booked this month`}
          </p>
        </div>
        <Link href={`/${orgSlug}/leads`} className="text-sm underline-offset-4 hover:underline">
          List view
        </Link>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex gap-3 overflow-x-auto">
        {OPEN_STAGES.map((stage) => {
          const cards = rows.filter((r) => r.lead.stage === stage)
          const value = cards.reduce((s, r) => s + (r.lead.estimated_value ?? 0), 0)
          return (
            <div
              key={stage}
              className="min-w-[240px] flex-1 space-y-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, stage)}
            >
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">{LEAD_STAGE_LABELS[stage]}</h2>
                <span className="text-xs text-muted-foreground">{`${cards.length} · ${money(value)}`}</span>
              </div>
              <div className="space-y-2">
                {cards.map((row) => {
                  const { lead } = row
                  const subtitle = [
                    lead.event_type,
                    lead.event_date ? shortDate(lead.event_date) : null,
                  ].filter(Boolean).join(' · ')
                  return (
                    <Card
                      key={lead.id}
                      data-health={row.health}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', lead.id)}
                      className={row.health === 'needs_attention' ? 'border-l-2 border-l-destructive' : undefined}
                    >
                      <CardContent className="py-3 space-y-2">
                        <Link href={`/${orgSlug}/leads/${lead.id}`} className="block space-y-1">
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            {row.health === 'needs_attention' && (
                              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                            )}
                            {opportunityTitle(lead)}
                          </p>
                          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                          <p className={`truncate text-xs ${row.health === 'needs_attention' ? 'text-destructive' : 'text-muted-foreground'}`}>{row.statusLine}</p>
                          {lead.estimated_value != null && (
                            <p className="text-xs font-medium">{money(lead.estimated_value)}</p>
                          )}
                        </Link>
                        <select
                          value={lead.stage}
                          onChange={(e) => handleStageChange(row, e.target.value as LeadStage)}
                          aria-label={`Stage for ${opportunityTitle(lead)}`}
                          className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {BOARD_STAGES.map((s) => (
                            <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>
                          ))}
                        </select>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <ClosedMonthSummary orgSlug={orgSlug} monthly={monthly} />
    </div>
  )
}
