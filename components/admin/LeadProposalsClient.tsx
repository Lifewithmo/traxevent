'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import {
  formatProposalMoney,
  proposalDisplayRange,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_TONE,
} from '@/lib/proposals'
import type { Proposal } from '@/lib/types'

interface LeadProposalsClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  proposals: Proposal[]
}

// How long the copy button holds its "Copied!" acknowledgement before
// reverting to its resting label. Exported so the test asserts against the
// same constant instead of a hardcoded duplicate that could drift.
export const COPIED_RESET_MS = 2000

export function LeadProposalsClient({ orgSlug, leadId, proposals }: LeadProposalsClientProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Single outstanding reset timer: copying a second link restarts the clock
  // rather than letting the first timer clear the second row's label early.
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Clearing the timer at unmount is not enough on its own: the timer is only
  // installed *after* the clipboard promise settles. This panel lives behind a
  // `{selected === 'proposal' && …}` switch in TasksAndDocuments, so picking
  // another attachment chip mid-await unmounts it while `copiedTimer` is still
  // null — cleanup finds nothing, and the continuation then schedules a timer
  // nobody will ever clear. This flag lets the continuation notice it is
  // running past the component's lifetime and bail out.
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    }
  }, [])

  async function handleCopy(token: string) {
    setError(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/proposals/${token}`)
      if (!alive.current) return
      setCopied(token)
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => {
        copiedTimer.current = null
        setCopied(null)
      }, COPIED_RESET_MS)
    } catch {
      if (!alive.current) return
      setError('Could not copy link.')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Proposals</CardTitle>
          {/* nativeButton={false}: Base UI defaults it true and then merges
              type="button" onto whatever it renders, so these link-rendering
              buttons emitted `<a type="button" href>` — `type` on an anchor is
              a MIME hint, not a button type — plus a dev-only console error.
              role="link" is ours: turning nativeButton off makes Base UI stamp
              role="button" unconditionally, which would announce three plain
              navigations as buttons and drop them out of the links rotor. */}
          <Button
            nativeButton={false}
            role="link"
            render={<Link href={`/${orgSlug}/leads/${leadId}/proposals/new`} />}
          >
            New proposal
          </Button>
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
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  role="link"
                  render={<Link href={`/${orgSlug}/leads/${leadId}/proposals/new`} />}
                >
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
                    {min === max
                      ? formatProposalMoney(min)
                      : `${formatProposalMoney(min)}–${formatProposalMoney(max)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.status !== 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => handleCopy(p.token)}>
                      {copied === p.token ? 'Copied!' : 'Copy client link'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    role="link"
                    render={<Link href={`/${orgSlug}/leads/${leadId}/proposals/${p.id}`} />}
                  >
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
