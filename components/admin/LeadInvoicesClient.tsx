'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createInvoice } from '@/actions/invoices'
import { invoiceTotal, invoiceBalance, INVOICE_STATUS_LABELS } from '@/lib/invoices'
import type { Invoice } from '@/lib/types'

interface LeadInvoicesClientProps {
  orgId: string
  orgSlug: string
  leadId: string
  invoices: Invoice[]
}

const money = (n: number) => `$${n.toFixed(2)}`

export function LeadInvoicesClient({ orgId, orgSlug, leadId, invoices }: LeadInvoicesClientProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'New invoice'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div aria-live="polite" aria-atomic="true">
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

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
                  <Badge variant="secondary">{INVOICE_STATUS_LABELS[inv.status ?? 'draft']}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {money(invoiceTotal(inv.line_items))} · balance {money(invoiceBalance(inv))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {inv.status !== 'draft' && (
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
