'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { nudgeProposal } from '@/actions/nudge'
import { LEAD_STAGE_LABELS, LOST_REASON_LABELS, opportunityTitle } from '@/lib/leads'
import type { PipelineGroups, PipelineRow, closedThisMonth } from '@/lib/pipeline-view'
import type { Lead } from '@/lib/types'
import { NewOpportunityForm } from './NewOpportunityForm'

interface PipelineListClientProps {
  orgId: string
  orgSlug: string
  groups: PipelineGroups
  closed: Lead[]
  openCount: number
  openValue: number
  monthly: ReturnType<typeof closedThisMonth>
  view: 'list' | 'board'
}

type Tab = 'needs_move' | 'open' | 'closed'

const money = (n: number) => `$${n.toLocaleString()}`

export function PipelineListClient({
  orgId, orgSlug, groups, closed, openCount, openValue, monthly,
}: PipelineListClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('open')
  const [creating, setCreating] = useState(false)
  const [nudging, setNudging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  function renderRow(row: PipelineRow) {
    const { lead } = row
    return (
      <Card key={lead.id}>
        <CardContent className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <Link href={`/${orgSlug}/leads/${lead.id}`} className="block text-sm font-medium hover:underline">
              {opportunityTitle(lead)}
            </Link>
            <p className="text-xs text-muted-foreground">{row.statusLine}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline">{LEAD_STAGE_LABELS[lead.stage]}</Badge>
            {lead.estimated_value != null && (
              <span className="text-sm font-medium">{money(lead.estimated_value)}</span>
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
          </div>
        </CardContent>
      </Card>
    )
  }

  function renderClosedRow(lead: Lead) {
    return (
      <Card key={lead.id}>
        <CardContent className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <Link href={`/${orgSlug}/leads/${lead.id}`} className="block text-sm font-medium hover:underline">
              {opportunityTitle(lead)}
            </Link>
            {lead.lost && (
              <p className="text-xs text-muted-foreground">Lost — {LOST_REASON_LABELS[lead.lost.reason]}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline">{LEAD_STAGE_LABELS[lead.stage]}</Badge>
            {lead.closed_at && (
              <span className="text-xs text-muted-foreground">{lead.closed_at.slice(0, 10)}</span>
            )}
            {lead.estimated_value != null && (
              <span className="text-sm font-medium">{money(lead.estimated_value)}</span>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const openEmpty = groups.needs_attention.length + groups.waiting.length + groups.active.length === 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {`${openCount} open · ${money(openValue)} · ${monthly.wonCount} booked this month`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/${orgSlug}/leads?view=board`} className="text-sm underline-offset-4 hover:underline">
            Board view
          </Link>
          {!creating && (
            <Button onClick={() => { setCreating(true); setError(null) }}>New opportunity</Button>
          )}
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <NewOpportunityForm orgId={orgId} open={creating} onClose={() => setCreating(false)} />

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
          <div className="space-y-2">{groups.needs_attention.map(renderRow)}</div>
        )
      )}

      {activeTab === 'open' && (
        openEmpty ? (
          <p className="text-sm text-muted-foreground">No open opportunities.</p>
        ) : (
          <div className="space-y-6">
            {groups.needs_attention.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-destructive">Needs attention</h2>
                {groups.needs_attention.map(renderRow)}
              </section>
            )}
            {groups.waiting.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Waiting on them</h2>
                {groups.waiting.map(renderRow)}
              </section>
            )}
            {groups.active.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Moving</h2>
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
          <div className="space-y-2">{closed.map(renderClosedRow)}</div>
        )
      )}
    </div>
  )
}
