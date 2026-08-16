'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { proposalDisplayRange, PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONE } from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

interface LeadProposalsClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  proposals: Proposal[]
}

// List-view money convention (matches ClientWorkingRail/TodayKpiBand): thousands
// separators, no forced cents — `$12,345`, not `$12345.00`.
function money(n: number): string {
  return `$${n.toLocaleString()}`
}

// How long the copy button holds its "Copied!" acknowledgement before
// reverting to its resting label.
const COPIED_RESET_MS = 2000

export function LeadProposalsClient({ orgSlug, leadId, proposals }: LeadProposalsClientProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Single outstanding reset timer: copying a second link restarts the clock
  // rather than letting the first timer clear the second row's label early.
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    }
  }, [])

  async function handleCopy(token: string) {
    setError(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/proposals/${token}`)
      setCopied(token)
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => {
        copiedTimer.current = null
        setCopied(null)
      }, COPIED_RESET_MS)
    } catch {
      setError('Could not copy link.')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Proposals</CardTitle>
          <Button render={<Link href={`/${orgSlug}/leads/${leadId}/proposals/new`} />}>New proposal</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {proposals.length === 0 && (
            <EmptyState
              title="No proposals yet"
              description="Draft one to send this client pricing."
              action={
                <Button variant="outline" size="sm" render={<Link href={`/${orgSlug}/leads/${leadId}/proposals/new`} />}>
                  New proposal
                </Button>
              }
            />
          )}

          {proposals.map((p) => {
            const { min, max } = proposalDisplayRange(p)
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.title || 'Untitled proposal'}</span>
                    <StatusPill tone={PROPOSAL_STATUS_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</StatusPill>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {min === max ? money(min) : `${money(min)}–${money(max)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.status !== 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => handleCopy(p.token)}>
                      {copied === p.token ? 'Copied!' : 'Copy client link'}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" render={<Link href={`/${orgSlug}/leads/${leadId}/proposals/${p.id}`} />}>
                    Edit
                  </Button>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
