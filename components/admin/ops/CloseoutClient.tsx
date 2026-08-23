'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusPill } from '@/components/ui/status-pill'
import { saveActuals, getCloseoutSummary, completeCloseout } from '@/actions/event-ops'
import { generateCloseoutInvoice } from '@/actions/invoices'
import { computeCloseoutSummary } from '@/lib/ops/derive'
import { formatMoney } from '@/lib/utils'
import type { OpsPlan, OpsCloseout, CloseoutSummary, Lead, WorkPackage, OpsResource } from '@/lib/types'

export interface CloseoutClientProps {
  orgId: string
  eventId: string
  orgSlug: string
  isAdmin: boolean
  eventName: string
  plan: OpsPlan
  /** The plan's packages + org resources (the same reads closeoutSummaryCore does
   *  server-side). Optional: without them the margin card falls back to the saved
   *  server summary instead of recomputing live. */
  packages?: WorkPackage[]
  resources?: OpsResource[]
  closeout: OpsCloseout | null
  summary: CloseoutSummary | null
  summaryError: string | null
  leads: Lead[]
  linkedLead: { id: string; title: string } | null
  linkBroken?: boolean
}

/** Signed planned-vs-actual delta as a chip. `goodWhenPositive` flips the tone
 *  for cost-like figures where coming in above plan is the bad direction. */
function DeltaChip({ delta, goodWhenPositive = true }: { delta: number; goodWhenPositive?: boolean }) {
  if (Math.abs(delta) < 0.005) return <StatusPill tone="neutral">on plan</StatusPill>
  const good = goodWhenPositive ? delta > 0 : delta < 0
  return (
    <StatusPill tone={good ? 'confirmed' : 'alert'} className="tabular-nums">
      {delta < 0 ? '−' : '+'}{formatMoney(Math.abs(delta))} vs plan
    </StatusPill>
  )
}

export function CloseoutClient(props: CloseoutClientProps) {
  const { orgId, eventId, plan, packages, resources } = props
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
  // Edit sequence for the compute-relevant fields (quantities, sales): editSeq
  // bumps on every edit, savedSeq records the sequence the last completed save's
  // payload was built from. While edits are ahead of the last save (dirty) the
  // margin card shows the live recompute; once level it returns to the saved
  // summary — the source of truth. A counter rather than a boolean so a save
  // resolving cannot hide edits typed while it was in flight.
  const [editSeq, setEditSeq] = useState(0)
  const [savedSeq, setSavedSeq] = useState(0)
  const dirty = editSeq > savedSeq
  const router = useRouter()

  // Live recompute of the same pure function the server runs, on every
  // actuals/sales change. Replicates closeoutSummaryCore's deleted-package
  // guard; Number() coercion with NaN guards mirrors the save payload
  // (blank/invalid quantities contribute nothing, like unsaved fields).
  const live = useMemo<{ summary: CloseoutSummary | null; error: string | null } | null>(() => {
    if (!packages || !resources) return null
    const foundIds = new Set(packages.map((p) => p.id))
    const missing = plan.package_ids.find((id) => !foundIds.has(id))
    if (missing) return { summary: null, error: `Package no longer exists: ${missing}` }
    const salesNum = Number(sales)
    return {
      summary: computeCloseoutSummary({
        packages,
        resources,
        guests: plan.requirements.guests,
        actual_consumables: plan.shopping_list
          .filter((i) => (qtyUsed[i.resource_id] ?? '') !== '')
          .map((i) => ({ resource_id: i.resource_id, qty_used: Number(qtyUsed[i.resource_id]) }))
          .filter((c) => Number.isFinite(c.qty_used)),
        sales: sales !== '' && Number.isFinite(salesNum) ? salesNum : 0,
      }),
      error: null,
    }
  }, [packages, resources, plan, qtyUsed, sales])

  const shownSummary = dirty && live?.summary ? live.summary : summary
  const shownError = shownSummary ? null : dirty && live?.error ? live.error : props.summaryError
  // Delta chips are interpretation, and a zero-actuals saved summary has nothing
  // to interpret: against a costed plan it would read as a beaten plan before
  // anything was recorded. Chips render only once actuals exist (saved) or the
  // operator is actively editing (dirty).
  const showDeltas = hasActuals || dirty

  async function handleSaveActuals() {
    const seqAtSave = editSeq // the payload below is built from this same render's state
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
      // Mark only what this save captured as clean — edits typed during the
      // in-flight save keep the live recompute showing.
      setSavedSeq((prev) => Math.max(prev, seqAtSave))
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
                onChange={(e) => { setQtyUsed((prev) => ({ ...prev, [i.resource_id]: e.target.value })); setEditSeq((s) => s + 1) }}
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
              <Input id="co-sales" type="number" step="0.01" className="w-36" value={sales} onChange={(e) => { setSales(e.target.value); setEditSeq((s) => s + 1) }} />
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
        <CardHeader>
          <CardTitle className="text-base">2 · Margin vs plan</CardTitle>
          <p className="text-sm text-muted-foreground">
            {live ? 'Updates as you type · ' : ''}consumables + sales only — excludes labor
          </p>
        </CardHeader>
        <CardContent>
          {shownError ? (
            <div className="text-sm text-destructive">
              <p className="font-medium">{shownError}</p>
              <p className="mt-1">
                A package on this plan was deleted from the catalog. Restore it in the catalog (same name and lines)
                or contact support — the summary can&apos;t be computed without it.
              </p>
            </div>
          ) : shownSummary ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2.5 max-[700px]:grid-cols-1">
                {/* No vs-plan chip here: revenue − planned revenue is exactly the
                    sales figure typed in the input above, and the tile note
                    already says sales are included. */}
                <StatTile
                  label="Revenue" value={formatMoney(shownSummary.revenue)} tone="money"
                  note="Packages + sales"
                />
                <div className="flex flex-col items-start gap-1.5">
                  <StatTile
                    label="Actual margin"
                    value={formatMoney(shownSummary.actual_margin)}
                    tone={shownSummary.actual_margin < 0 ? 'alert' : 'money'}
                    className="w-full flex-1"
                  />
                  {showDeltas && <DeltaChip delta={shownSummary.actual_margin - shownSummary.planned_margin} />}
                </div>
                <StatTile label="Planned margin" value={formatMoney(shownSummary.planned_margin)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Consumables: planned{' '}
                <span className="font-medium tabular-nums text-foreground">{formatMoney(shownSummary.planned_consumable_cost)}</span>
                {' '}· actual{' '}
                <span className="font-medium tabular-nums text-foreground">{formatMoney(shownSummary.actual_consumable_cost)}</span>
                {showDeltas && Math.abs(shownSummary.actual_consumable_cost - shownSummary.planned_consumable_cost) >= 0.005 && (
                  <>
                    {' '}·{' '}
                    <DeltaChip
                      delta={shownSummary.actual_consumable_cost - shownSummary.planned_consumable_cost}
                      goodWhenPositive={false}
                    />
                  </>
                )}
              </p>
              {shownSummary.cost_gaps && shownSummary.cost_gaps.length > 0 && (
                <p className="rounded-lg border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn-fg)]">
                  Planned cost omits {shownSummary.cost_gaps.length} resource(s) with no unit conversion: {shownSummary.cost_gaps.join(', ')}
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
