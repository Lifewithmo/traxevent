'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { nudgeProposal } from '@/actions/nudge'
import { setLeadStage } from '@/actions/leads'
import { OPEN_STAGES, LEAD_STAGE_LABELS, LOST_REASON_LABELS, opportunityTitle } from '@/lib/leads'
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
  openValue: number
  monthly: ReturnType<typeof closedThisMonth>
  customers?: Customer[]
}

type Tab = 'needs_move' | 'open' | 'closed'

const money = (n: number) => `$${n.toLocaleString()}`

// Advance sequence: open stages in order, then Closed Won — same source of
// truth as the board's StageChip menu (spec §10.2).
const ADVANCE_STAGES: LeadStage[] = [...OPEN_STAGES, 'closed_won']

function nextStage(stage: LeadStage): LeadStage | null {
  const idx = ADVANCE_STAGES.indexOf(stage)
  if (idx === -1 || idx + 1 >= ADVANCE_STAGES.length) return null
  return ADVANCE_STAGES[idx + 1]
}

export function PipelineListClient({
  orgId, orgSlug, groups, closed, openCount, openValue, monthly, customers,
}: PipelineListClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('open')
  const [creating, setCreating] = useState(false)
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [nudging, setNudging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  async function handleStageChange(row: PipelineRow, newStage: LeadStage) {
    if (newStage === row.lead.stage) return
    setError(null)
    try {
      await setLeadStage(orgId, row.lead.id, newStage)
      if (newStage === 'closed_won') {
        router.push(`/${orgSlug}/leads/${row.lead.id}?convert=1`)
      } else {
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to move opportunity')
    }
  }

  function renderRow(row: PipelineRow) {
    const { lead } = row
    const title = opportunityTitle(lead)
    const next = nextStage(lead.stage)
    return (
      <div
        key={lead.id}
        data-row={lead.id}
        className="flex items-center justify-between gap-4"
        style={{
          padding: 12,
          borderBottom: '1px solid color-mix(in oklab, var(--border) 60%, transparent)',
          borderLeft: `2px solid ${row.health === 'needs_attention' ? 'var(--destructive)' : 'transparent'}`,
        }}
      >
        <div className="min-w-0">
          <Link href={`/${orgSlug}/leads/${lead.id}`} className="block text-sm font-medium hover:underline">
            {title}
          </Link>
          <p className={`text-xs ${row.health === 'needs_attention' ? 'text-destructive' : 'text-muted-foreground'}`}>{row.statusLine}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StageChip
            stage={lead.stage}
            ariaContext={title}
            onStage={(s) => handleStageChange(row, s)}
            onMarkLost={() => router.push(`/${orgSlug}/leads/${lead.id}?focus=lost`)}
          />
          {lead.estimated_value != null && (
            <span className="text-sm font-medium tabular-nums">{money(lead.estimated_value)}</span>
          )}
          {row.countdown && <Badge variant="secondary">{row.countdown}</Badge>}
          {row.quickAction === 'set_next_step' && (
            <Link href={`/${orgSlug}/leads/${lead.id}?focus=task`}>
              <Button size="sm">Set next step</Button>
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
            <Button size="sm" variant="outline" onClick={() => handleStageChange(row, next)}>
              {`Move to ${LEAD_STAGE_LABELS[next]}`}
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
        className="flex items-center justify-between gap-4"
        style={{
          padding: 12,
          borderBottom: '1px solid color-mix(in oklab, var(--border) 60%, transparent)',
          borderLeft: '2px solid transparent',
        }}
      >
        <div className="min-w-0">
          <Link href={`/${orgSlug}/leads/${lead.id}`} className="block text-sm font-medium hover:underline">
            {opportunityTitle(lead)}
          </Link>
          {lead.lost && (
            <p className="text-xs text-muted-foreground">Lost — {LOST_REASON_LABELS[lead.lost.reason]}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{LEAD_STAGE_LABELS[lead.stage]}</span>
          {lead.closed_at && (
            <span className="text-xs text-muted-foreground">{lead.closed_at.slice(0, 10)}</span>
          )}
          {lead.estimated_value != null && (
            <span className="text-sm font-medium tabular-nums">{money(lead.estimated_value)}</span>
          )}
        </div>
      </div>
    )
  }

  const openEmpty = groups.needs_attention.length + groups.waiting.length + groups.active.length === 0

  return (
    <div className="p-6 space-y-6">
      {actionsSlot && createPortal(
        <>
          <Link href={`/${orgSlug}/leads?view=board`} className="text-sm underline-offset-4 hover:underline">
            Board view
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

      <div className="flex gap-2">
        <Button
          variant={activeTab === 'needs_move' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={activeTab === 'needs_move'}
          onClick={() => setActiveTab('needs_move')}
        >
          Needs a move ({groups.needs_attention.length})
        </Button>
        <Button
          variant={activeTab === 'open' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={activeTab === 'open'}
          onClick={() => setActiveTab('open')}
        >
          All open ({openCount})
        </Button>
        <Button
          variant={activeTab === 'closed' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={activeTab === 'closed'}
          onClick={() => setActiveTab('closed')}
        >
          Closed ({closed.length})
        </Button>
      </div>

      {activeTab === 'needs_move' && (
        groups.needs_attention.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs a move — everything has a next step.</p>
        ) : (
          <div>{groups.needs_attention.map(renderRow)}</div>
        )
      )}

      {activeTab === 'open' && (
        openEmpty ? (
          <p className="text-sm text-muted-foreground">No open opportunities.</p>
        ) : (
          <div className="space-y-6">
            {groups.needs_attention.length > 0 && (
              <section>
                <h2 className="pb-2 text-sm font-semibold text-destructive">Needs attention</h2>
                {groups.needs_attention.map(renderRow)}
              </section>
            )}
            {groups.waiting.length > 0 && (
              <section>
                <h2 className="pb-2 text-sm font-semibold">Waiting on them</h2>
                {groups.waiting.map(renderRow)}
              </section>
            )}
            {groups.active.length > 0 && (
              <section>
                <h2 className="pb-2 text-sm font-semibold">Moving</h2>
                {groups.active.map(renderRow)}
              </section>
            )}
          </div>
        )
      )}

      {activeTab === 'closed' && (
        closed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing closed yet.</p>
        ) : (
          <div>{closed.map(renderClosedRow)}</div>
        )
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <p className="text-sm text-muted-foreground">
          {`${openCount} open · ${money(openValue)} · ${monthly.wonCount} booked this month`}
        </p>
        <ClosedMonthSummary orgSlug={orgSlug} monthly={monthly} />
      </div>
    </div>
  )
}
