'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { proposalDisplayRange, PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

interface LeadProposalsClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  proposals: Proposal[]
}

const money = (n: number) => `$${n.toFixed(2)}`

export function LeadProposalsClient({ orgSlug, leadId, proposals }: LeadProposalsClientProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCopy(token: string) {
    setError(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/proposals/${token}`)
      setCopied(token)
    } catch {
      setError('Could not copy link.')
    }
  }

  return (
    <div className="p-6 pt-0 max-w-2xl space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Proposals</CardTitle>
          <Link
            href={`/${orgSlug}/leads/${leadId}/proposals/new`}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            New proposal
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {proposals.length === 0 && (
            <p className="text-sm text-muted-foreground">No proposals yet.</p>
          )}

          {proposals.map((p) => {
            const { min, max } = proposalDisplayRange(p)
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.title || 'Untitled proposal'}</span>
                    <Badge variant="secondary">{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{min === max ? money(min) : `${money(min)}–${money(max)}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  {p.status !== 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => handleCopy(p.token)}>
                      {copied === p.token ? 'Copied!' : 'Copy client link'}
                    </Button>
                  )}
                  <Link
                    href={`/${orgSlug}/leads/${leadId}/proposals/${p.id}`}
                    className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
