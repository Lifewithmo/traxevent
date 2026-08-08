'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Closeout — {props.eventName}</h1>
        {completed && <p className="text-sm font-medium text-green-700 mt-1">Closeout complete.</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Record actuals</CardTitle>
          <p className="text-sm text-gray-500">Pre-filled with planned quantities — adjust to what you actually used.</p>
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
              <span className="text-xs text-gray-500">{i.unit ?? ''} (planned {i.qty})</span>
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
            <div className="text-sm text-red-700">
              <p className="font-medium">{props.summaryError}</p>
              <p className="mt-1">
                A package on this plan was deleted from the catalog. Restore it in the catalog (same name and lines)
                or contact support — the summary can&apos;t be computed without it.
              </p>
            </div>
          ) : summary ? (
            <table className="text-sm w-full max-w-md">
              <tbody>
                <tr><td className="py-1 text-gray-500">Revenue (packages + sales)</td><td className="text-right font-medium">{formatMoney(summary.revenue)}</td></tr>
                <tr><td className="py-1 text-gray-500">Planned consumable cost</td><td className="text-right">{formatMoney(summary.planned_consumable_cost)}</td></tr>
                <tr><td className="py-1 text-gray-500">Actual consumable cost</td><td className="text-right">{formatMoney(summary.actual_consumable_cost)}</td></tr>
                <tr className="border-t"><td className="py-1 text-gray-500">Planned margin</td><td className="text-right">{formatMoney(summary.planned_margin)}</td></tr>
                <tr><td className="py-1 font-medium">Actual margin</td><td className="text-right font-bold">{formatMoney(summary.actual_margin)}</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500">Save actuals to see the margin summary.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3 · Complete</CardTitle>
          <p className="text-sm text-gray-500">The event isn&apos;t complete until closeout is done.</p>
        </CardHeader>
        <CardContent>
          {props.isAdmin && !completed && (
            <Button onClick={handleComplete} disabled={saving || !hasActuals}>Complete closeout</Button>
          )}
          {!props.isAdmin && !completed && <p className="text-sm text-gray-500">An admin completes the closeout.</p>}
          {completed && <p className="text-sm text-green-700">Done. Generate the final invoice below.</p>}
        </CardContent>
      </Card>

      {completed && props.isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4 · Generate final invoice</CardTitle>
            <p className="text-sm text-gray-500">One line per package at catalog price, as a draft in the invoicing module. Margin numbers stay internal.</p>
          </CardHeader>
          <CardContent className="flex items-end gap-2">
            {props.linkedLead ? (
              <p className="text-sm">
                Bill to <span className="font-medium">{props.linkedLead.title}</span>
              </p>
            ) : (
              <div>
                {props.linkBroken && (
                  <p role="status" className="mb-1 text-sm text-amber-700">
                    The opportunity this job came from no longer exists — pick who to bill.
                  </p>
                )}
                <Label htmlFor="co-lead">Bill to</Label>
                <select id="co-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}
                  className="block h-9 rounded-md border border-gray-300 px-2 text-sm min-w-48">
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
