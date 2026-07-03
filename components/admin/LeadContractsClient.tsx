'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createContract } from '@/actions/contracts'
import { CONTRACT_STATUS_LABELS } from '@/lib/contracts'
import type { Contract } from '@/lib/types'

interface LeadContractsClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  contracts: Contract[]
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function LeadContractsClient({ orgId, orgSlug, leadId, contracts }: LeadContractsClientProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setCreating(true); setError(null)
    try {
      const created = await createContract(orgId, leadId, {})
      router.push(`/${orgSlug}/leads/${leadId}/contracts/${created.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create contract')
      setCreating(false)
    }
  }

  async function handleCopy(token: string) {
    setError(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/contracts/${token}`)
      setCopied(token)
    } catch {
      setError('Could not copy link.')
    }
  }

  return (
    <div className="p-6 pt-0 max-w-2xl space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Contracts</CardTitle>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'New contract'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {contracts.length === 0 && (
            <p className="text-sm text-muted-foreground">No contracts yet.</p>
          )}

          {contracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.title || 'Contract'}</span>
                  <Badge variant="secondary">{CONTRACT_STATUS_LABELS[c.status]}</Badge>
                </div>
                {c.status === 'signed' && c.signed_by && (
                  <p className="text-xs text-muted-foreground">
                    Signed by {c.signed_by}{c.signed_at ? ` on ${formatDate(c.signed_at)}` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {c.status !== 'draft' && (
                  <Button size="sm" variant="outline" onClick={() => handleCopy(c.token)}>
                    {copied === c.token ? 'Copied!' : 'Copy client link'}
                  </Button>
                )}
                <Link
                  href={`/${orgSlug}/leads/${leadId}/contracts/${c.id}`}
                  className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
