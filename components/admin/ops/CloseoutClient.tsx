'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusPill } from '@/components/ui/status-pill'
import { saveActuals, getCloseoutSummary, completeCloseout } from '@/actions/event-ops'
import { generateCloseoutInvoice } from '@/actions/invoices'
import { formatMoney } from '@/lib/utils'
import type { OpsPlan, OpsCloseout, CloseoutSummary, Lead } from '@/lib/types'

export interface CloseoutClientProps {
  orgId: string
  eventId: string
  orgSlug: string
  isAdmin: boolean
  eventName: string
  plan: OpsPlan
  closeout: OpsCloseout | null
  summary: CloseoutSummary | null
  summaryError: string | null
  leads: Lead[]
  linkedLead: { id: string; title: string } | null
  linkBroken?: boolean
}

export function CloseoutClient(props: CloseoutClientProps) {
  const { orgId, eventId, plan } = props
  const saved = props.closeout?.actuals
  const savedQty = new Map((saved?.consumables ?? []).map((c) => [c.resource_id, c.qty_used]))

  const [qtyUsed, setQtyUsed] = useState<Record<string, string>>(
    Object.fromEntries(plan.shopping_list.map((i) => [i.resource_id, String(savedQty.get(i.resource_id) ?? i.qty)]))
  )
  const [hours, setHours] = useState(saved?.hours_worked !== undefined ? String(saved.hours_worked) : '')
  const [sales, setSales] = useState(saved?.sales !== undefined ? String(saved.sales) : '')
  const [waste, setWaste] = useState(saved?.waste_notes ?? '')
  const [summary, setSummary] = useState(props.summary)
  const [completed, setCompleted] = useState(props.closeout?.completed ?? false)
  const [hasActuals, setHasActuals] = useState(
    !!saved && ((saved.consumables?.length ?? 0) > 0 || saved.hours_worked !== undefined || saved.sales !== undefined || saved.waste_notes !== undefined)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leadId, setLeadId] = useState(props.linkedLead?.id ?? '')
  const router = useRouter()

  async function handleSaveActuals() {
    setSaving(true); setError(null)
    try {
      await saveActuals(orgId, eventId, {
        consumables: plan.shopping_list
          .filter((i) => qtyUsed[i.resource_id] !== '')
          .map((i) => ({ resource_id: i.resource_id, qty_used: Number(qtyUsed[i.resource_id]) })),
        ...(hours !== '' ? { hours_worked: Number(hours) } : {}),
        ...(sales !== '' ? { sales: Number(sales) } : {}),
        ...(waste.trim() ? { waste_notes: waste.trim() } : {}),
      })
      setHasActuals(true)
      setSummary(await getCloseoutSummary(orgId, eventId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateInvoice() {
    setSaving(true); setError(null)
    try {
      await generateCloseoutInvoice(orgId, eventId, leadId)
      router.push(`/${props.orgSlug}/leads/${leadId}/invoices`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoice')
      setSaving(false)
    }
  }

  async function handleComplete() {
    setSaving(true); setError(null)
    try {
      await completeCloseout(orgId, eventId)
      setCompleted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to complete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5 max-w-4xl space-y-6">
      {completed && <StatusPill tone="confirmed">Closeout complete.</StatusPill>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Record actuals</CardTitle>
          <p className="text-sm text-muted-foreground">Pre-filled with planned quantities — adjust to what you actually used.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {plan.shopping_list.map((i) => (
            <div key={i.resource_id} className="flex items-center gap-2">
              <span className="text-sm w-56">{i.name}</span>
              <Input
                aria-label={`Actual ${i.name} used`}
                type="number" step="0.01" className="w-28"
                value={qtyUsed[i.resource_id] ?? ''}
                onChange={(e) => setQtyUsed((prev) => ({ ...prev, [i.resource_id]: e.target.value }))}
              />
              <span className="text-xs text-muted-foreground">{i.unit ?? ''} (planned {i.qty})</span>
            </div>
          ))}
          <div className="flex gap-3 flex-wrap">
            <div>
              <Label htmlFor="co-hours">Hours worked</Label>
              <Input id="co-hours" type="number" step="0.25" className="w-28" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="co-sales">Tips &amp; on-site sales ($)</Label>
              <Input id="co-sales" type="number" step="0.01" className="w-36" value={sales} onChange={(e) => setSales(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="co-waste">Waste notes</Label>
            <Input id="co-waste" value={waste} onChange={(e) => setWaste(e.target.value)} />
          </div>
          <Button onClick={handleSaveActuals} disabled={saving}>Save actuals</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2 · Margin vs plan</CardTitle></CardHeader>
        <CardContent>
          {props.summaryError && !summary ? (
            <div className="text-sm text-destructive">
              <p className="font-medium">{props.summaryError}</p>
              <p className="mt-1">
                A package on this plan was deleted from the catalog. Restore it in the catalog (same name and lines)
                or contact support — the summary can&apos;t be computed without it.
              </p>
            </div>
          ) : summary ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2.5 max-[700px]:grid-cols-1">
                <StatTile label="Revenue" value={formatMoney(summary.revenue)} tone="money" note="Packages + sales" />
                <StatTile
                  label="Actual margin"
                  value={formatMoney(summary.actual_margin)}
                  tone={summary.actual_margin < 0 ? 'alert' : 'money'}
                />
                <StatTile label="Planned margin" value={formatMoney(summary.planned_margin)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Consumables: planned{' '}
                <span className="font-medium tabular-nums text-foreground">{formatMoney(summary.planned_consumable_cost)}</span>
                {' '}· actual{' '}
                <span className="font-medium tabular-nums text-foreground">{formatMoney(summary.actual_consumable_cost)}</span>
              </p>
              {summary.cost_gaps && summary.cost_gaps.length > 0 && (
                <p className="rounded-lg border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn-fg)]">
                  Planned cost omits {summary.cost_gaps.length} resource(s) with no unit conversion: {summary.cost_gaps.join(', ')}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Save actuals to see the margin summary.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3 · Complete</CardTitle>
          <p className="text-sm text-muted-foreground">The event isn&apos;t complete until closeout is done.</p>
        </CardHeader>
        <CardContent>
          {props.isAdmin && !completed && (
            <Button onClick={handleComplete} disabled={saving || !hasActuals}>Complete closeout</Button>
          )}
          {!props.isAdmin && !completed && <p className="text-sm text-muted-foreground">An admin completes the closeout.</p>}
          {completed && <StatusPill tone="confirmed">Done. Generate the final invoice below.</StatusPill>}
        </CardContent>
      </Card>

      {completed && props.isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4 · Generate final invoice</CardTitle>
            <p className="text-sm text-muted-foreground">One line per package at catalog price, as a draft in the invoicing module. Margin numbers stay internal.</p>
          </CardHeader>
          <CardContent className="flex items-end gap-2">
            {props.linkedLead ? (
              <p className="text-sm">
                Bill to <span className="font-medium">{props.linkedLead.title}</span>
              </p>
            ) : (
              <div>
                {props.linkBroken && (
                  <p role="status" className="mb-1 text-sm text-[var(--warn-fg)]">
                    The opportunity this job came from no longer exists — pick who to bill.
                  </p>
                )}
                <Label htmlFor="co-lead">Bill to</Label>
                <select id="co-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}
                  className="block h-8 rounded-lg border border-input bg-transparent px-2 text-sm min-w-48">
                  <option value="">Pick a client…</option>
                  {props.leads.map((l) => <option key={l.id} value={l.id}>{l.name}{l.organization ? ` — ${l.organization}` : ''}</option>)}
                </select>
              </div>
            )}
            <Button onClick={handleGenerateInvoice} disabled={saving || !leadId}>Generate final invoice</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
