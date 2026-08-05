'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { createInvoice, generateFromProposal } from '@/actions/invoices'
import { invoiceAmountDue, invoiceBalance } from '@/lib/invoices'
import { INVOICE_LIFECYCLE_LABELS, INVOICE_TYPE_LABELS } from '@/lib/invoice-status'
import type { NormalizedInvoice, InvoiceType } from '@/lib/types'

interface LeadInvoicesClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  invoices: NormalizedInvoice[]
  acceptedProposals: { id: string; title?: string }[]
}

const money = (n: number) => `$${n.toFixed(2)}`
const INVOICE_TYPES: InvoiceType[] = ['deposit', 'progress', 'final', 'quick']

export function LeadInvoicesClient({ orgId, orgSlug, leadId, invoices, acceptedProposals }: LeadInvoicesClientProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showGen, setShowGen] = useState(false)
  const [genProposalId, setGenProposalId] = useState(acceptedProposals[0]?.id ?? '')
  const [genType, setGenType] = useState<InvoiceType>('deposit')
  const [generating, setGenerating] = useState(false)

  async function handleCreate() {
    setCreating(true); setError(null)
    try {
      const created = await createInvoice(orgId, leadId, {})
      router.push(`/${orgSlug}/leads/${leadId}/invoices/${created.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice')
      setCreating(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true); setError(null)
    try {
      const created = await generateFromProposal(orgId, leadId, genProposalId, { type: genType })
      router.push(`/${orgSlug}/leads/${leadId}/invoices/${created.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoice')
      setGenerating(false)
    }
  }

  async function handleCopy(token: string) {
    setError(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invoices/${token}`)
      setCopied(token)
    } catch {
      setError('Could not copy link.')
    }
  }

  return (
    <div className="p-6 pt-0 max-w-2xl space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Invoices</CardTitle>
          <div className="flex items-center gap-2">
            {acceptedProposals.length > 0 && (
              <Button variant="outline" onClick={() => setShowGen((v) => !v)}>
                Generate from proposal
              </Button>
            )}
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'New invoice'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {showGen && (
            <div className="space-y-3 rounded-md border border-border p-3">
              {acceptedProposals.length > 1 && (
                <div className="space-y-1">
                  <Label htmlFor="genProposal">Proposal</Label>
                  <select
                    id="genProposal"
                    value={genProposalId}
                    onChange={(e) => setGenProposalId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    {acceptedProposals.map((p) => (
                      <option key={p.id} value={p.id}>{p.title || 'Proposal'}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="genType">Type</Label>
                <select
                  id="genType"
                  value={genType}
                  onChange={(e) => setGenType(e.target.value as InvoiceType)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {INVOICE_TYPES.map((t) => (
                    <option key={t} value={t}>{INVOICE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? 'Generating…' : 'Generate'}
                </Button>
                <Button variant="ghost" onClick={() => setShowGen(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {invoices.length === 0 && (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          )}

          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {inv.number ? `#${inv.number} ` : ''}{inv.title || 'Invoice'}
                  </span>
                  <Badge variant="secondary">{INVOICE_LIFECYCLE_LABELS[inv.lifecycle]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {money(invoiceAmountDue(inv))} · balance {money(invoiceBalance(inv))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {inv.lifecycle !== 'draft' && (
                  <Button size="sm" variant="outline" onClick={() => handleCopy(inv.token)}>
                    {copied === inv.token ? 'Copied!' : 'Copy client link'}
                  </Button>
                )}
                <Link
                  href={`/${orgSlug}/leads/${leadId}/invoices/${inv.id}`}
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
