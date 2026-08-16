'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusPill } from '@/components/ui/status-pill'
import { PipelineStatTile } from '@/components/admin/pipeline/PipelineStatTile'
import { createVendor, updateVendor, deleteVendor } from '@/actions/vendors'
import { VENDOR_STATUSES, VENDOR_STATUS_LABELS, confirmedVendorCost, totalVendorCost } from '@/lib/vendors'
import { money, VENDOR_TONE } from '@/lib/pipeline-presentation'
import type { Vendor, VendorStatus } from '@/lib/types'

interface LeadVendorsClientProps {
  orgId: string
  leadId: string
  vendors: Vendor[]
}

/**
 * "Who is supplying this job, and what is it costing me?"
 *
 * This pane keeps a bespoke surface rather than moving onto RelatedRecordCard:
 * that card has no per-row action slot, and every row here owns two — a status
 * change and a delete. It matches the card's chrome exactly so the three
 * document panes read as siblings.
 *
 * The deciding numbers were already computed and thrown away — `confirmedVendorCost`
 * and `totalVendorCost` were rendered as a 12px gray sentence in the header. They
 * are figures now: committed spend is the one an operator margins against, so it
 * carries money tone, and the estimate beside it says how much of it is still
 * only potential.
 */
export function LeadVendorsClient({ orgId, leadId, vendors: initial }: LeadVendorsClientProps) {
  const [vendors, setVendors] = useState<Vendor[]>(initial)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Vendor | null>(null)

  const [name, setName] = useState('')
  const [service, setService] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [cost, setCost] = useState('')
  const [status, setStatus] = useState<VendorStatus>('potential')
  const [notes, setNotes] = useState('')

  function resetForm() {
    setName(''); setService(''); setContactName(''); setEmail(''); setPhone('')
    setCost(''); setStatus('potential'); setNotes('')
  }

  function openComposer() {
    setCreating(true); setError(null)
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError(null)
    const parsedCost = cost.trim() === '' ? undefined : Number(cost)
    try {
      const v = await createVendor(orgId, leadId, {
        name: name.trim(),
        service: service.trim() || undefined,
        contact_name: contactName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        ...(parsedCost != null && !Number.isNaN(parsedCost) ? { cost: parsedCost } : {}),
        status,
        notes: notes.trim() || undefined,
      })
      setVendors((prev) => [v, ...prev])
      setCreating(false); resetForm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally { setSaving(false) }
  }

  async function handleStatusChange(vendor: Vendor, newStatus: VendorStatus) {
    if (newStatus === vendor.status) return
    setError(null)
    const prev = vendors
    setVendors((p) => p.map((v) => (v.id === vendor.id ? { ...v, status: newStatus } : v)))
    try {
      await updateVendor(orgId, vendor.id, { status: newStatus })
    } catch (err: unknown) {
      setVendors(prev)
      setError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  async function confirmDelete() {
    const vendor = pendingDelete
    if (!vendor) return
    setPendingDelete(null)
    setSaving(true); setError(null)
    const prev = vendors
    setVendors((p) => p.filter((v) => v.id !== vendor.id))
    try {
      await deleteVendor(orgId, vendor.id)
    } catch (err: unknown) {
      setVendors(prev)
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally { setSaving(false) }
  }

  const confirmed = confirmedVendorCost(vendors)
  const total = totalVendorCost(vendors)
  const confirmedCount = vendors.filter((v) => v.status === 'confirmed').length
  const undecided = Math.round((total - confirmed) * 100) / 100

  return (
    <div className="space-y-3">
      {/* Empty means there is nothing to roll up — two "$0" tiles over an
          invitation is noise, not a figure band. */}
      {vendors.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {/* `contents` keeps the tile itself the grid item, so the test hook
              costs no layout. PipelineStatTile takes className, not arbitrary
              DOM props. */}
          <div data-testid="vendor-confirmed-cost" className="contents">
            <PipelineStatTile
              label="Committed"
              value={money(confirmed)}
              tone="money"
              note={`${confirmedCount} of ${vendors.length} confirmed`}
            />
          </div>
          <div data-testid="vendor-total-cost" className="contents">
            <PipelineStatTile
              label="Est. total"
              value={money(total)}
              note={undecided > 0 ? `${money(undecided)} still undecided` : 'all decided'}
            />
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h4 className="text-[13px] font-semibold">Vendors</h4>
          {!creating && (
            <Button variant="ghost" size="xs" onClick={openComposer}>+ New</Button>
          )}
        </header>

        <div aria-live="polite" aria-atomic="true">
          {error && <p className="px-3 pt-2 text-sm text-destructive">{error}</p>}
        </div>

        {creating && (
          <div className="space-y-3 border-b border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="vName">Name</Label>
                <Input id="vName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blooms & Co." />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vService">Service</Label>
                <Input id="vService" value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Florist" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vContact">Contact name</Label>
                <Input id="vContact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact person" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vEmail">Email</Label>
                <Input id="vEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@example.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vPhone">Phone</Label>
                <Input id="vPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vCost">Cost</Label>
                <Input id="vCost" type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vStatus">Status</Label>
                <select
                  id="vStatus"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as VendorStatus)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {VENDOR_STATUSES.map((s) => (
                    <option key={s} value={s}>{VENDOR_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="vNotes">Notes</Label>
              <textarea
                id="vNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
                className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="outline" onClick={() => { setCreating(false); resetForm() }}>Cancel</Button>
            </div>
          </div>
        )}

        {vendors.length === 0 && !creating && (
          <EmptyState
            title="No vendors yet"
            description="Track florists, rentals and staffing here so the job's committed cost stays honest."
            action={<Button variant="outline" size="sm" onClick={openComposer}>Add a vendor</Button>}
          />
        )}

        {vendors.map((v) => {
          const contact = [v.service, v.contact_name, v.email, v.phone].filter(Boolean).join(' · ')
          return (
            <div key={v.id} className="flex items-start justify-between gap-3 border-t border-border px-3 py-2 first:border-t-0">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium">{v.name}</span>
                  <StatusPill tone={VENDOR_TONE[v.status]}>{VENDOR_STATUS_LABELS[v.status]}</StatusPill>
                </div>
                {contact && <p className="truncate text-xs text-muted-foreground">{contact}</p>}
                {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {v.cost != null && (
                  <span
                    data-testid={`vendor-cost-${v.id}`}
                    className="text-[13px] font-semibold tabular-nums text-[var(--money-green)]"
                  >
                    {money(v.cost)}
                  </span>
                )}
                <select
                  value={v.status}
                  onChange={(e) => handleStatusChange(v, e.target.value as VendorStatus)}
                  aria-label={`Status for ${v.name}`}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {VENDOR_STATUSES.map((s) => (
                    <option key={s} value={s}>{VENDOR_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Delete ${v.name}`}
                  onClick={() => setPendingDelete(v)}
                  disabled={saving}
                >
                  Delete
                </Button>
              </div>
            </div>
          )
        })}

      </section>

      {/* Kit dialog, not window.confirm: the native prompt is unstyled, blocks
          the main thread, and cannot say WHICH vendor without string-building a
          title into it. */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this vendor?</DialogTitle>
            <DialogDescription>
              {pendingDelete ? `“${pendingDelete.name}” will be removed from this opportunity. This cannot be undone.` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
