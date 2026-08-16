'use client'

import { useState } from 'react'
import { MoreHorizontal, Truck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar } from '@/components/ui/avatar'
import { KpiBand } from '@/components/ui/kpi-band'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createVendor, updateVendor, deleteVendor } from '@/actions/vendors'
import {
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_TONE,
  confirmedVendorCost,
  totalVendorCost,
} from '@/lib/vendors'
import { formatMoney } from '@/lib/utils'
import type { Vendor, VendorStatus } from '@/lib/types'

interface LeadVendorsClientProps {
  orgId: string
  leadId: string
  vendors: Vendor[]
}

// Decision-first ordering: what still needs a call sits above what's settled.
const STATUS_RANK: Record<VendorStatus, number> = { potential: 0, confirmed: 1, declined: 2 }

const fieldClass =
  'flex w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground'

function VendorRow({
  vendor,
  busy,
  onStatusChange,
  onDelete,
}: {
  vendor: Vendor
  busy: boolean
  onStatusChange: (vendor: Vendor, status: VendorStatus) => void
  onDelete: (vendor: Vendor) => void
}) {
  const contact = [vendor.contact_name, vendor.email, vendor.phone].filter(Boolean).join(' · ')

  return (
    <div className="flex items-start gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0">
      <Avatar name={vendor.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">{vendor.name}</span>
          <StatusPill tone={VENDOR_STATUS_TONE[vendor.status]}>
            {VENDOR_STATUS_LABELS[vendor.status]}
          </StatusPill>
          {vendor.service && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {vendor.service}
            </span>
          )}
        </div>
        {contact && <p className="mt-0.5 truncate text-xs text-muted-foreground">{contact}</p>}
        {vendor.notes && <p className="mt-0.5 text-xs text-muted-foreground">{vendor.notes}</p>}
      </div>
      {vendor.cost != null && (
        <span className="text-sm font-semibold tabular-nums text-[var(--money-green)]">
          {formatMoney(vendor.cost)}
        </span>
      )}
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${vendor.name}`}
              disabled={busy}
            />
          }
        >
          <MoreHorizontal />
        </MenuTrigger>
        <MenuContent>
          {VENDOR_STATUSES.filter((s) => s !== vendor.status).map((s) => (
            <MenuItem key={s} onClick={() => onStatusChange(vendor, s)}>
              Mark {VENDOR_STATUS_LABELS[s].toLowerCase()}
            </MenuItem>
          ))}
          <MenuItem className="text-destructive" onClick={() => onDelete(vendor)}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  )
}

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

  const toConfirm = vendors.filter((v) => v.status === 'potential').length
  const ordered = vendors
    .map((v, i) => ({ v, i }))
    .sort((a, b) => STATUS_RANK[a.v.status] - STATUS_RANK[b.v.status] || a.i - b.i)
    .map((e) => e.v)

  function resetForm() {
    setName(''); setService(''); setContactName(''); setEmail(''); setPhone('')
    setCost(''); setStatus('potential'); setNotes('')
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

  async function handleDelete(vendor: Vendor) {
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

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Vendors</CardTitle>
        {!creating && (
          <Button size="sm" onClick={() => { setCreating(true); setError(null) }}>New vendor</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Three tiles, three columns: this panel lives in the narrow opportunity
            column, so the kit's page-level 4-up/2-up rhythm would orphan the last
            tile onto a half-width second row. `max-[1000px]:` is a viewport query,
            not a container query, so overriding it alone would also cancel the
            kit's phone protection — below 420px the tiles stack instead of
            squeezing a money figure into ~90px. */}
        <KpiBand className="grid-cols-3 max-[1000px]:grid-cols-3 max-[420px]:grid-cols-1">
          <StatTile label="Committed" value={formatMoney(confirmedVendorCost(vendors))} tone="money" />
          <StatTile label="Estimated total" value={formatMoney(totalVendorCost(vendors))} tone="money" />
          <StatTile label="To confirm" value={String(toConfirm)} tone={toConfirm > 0 ? 'alert' : 'default'} />
        </KpiBand>

        <div aria-live="polite" aria-atomic="true">
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {creating && (
          <div className="space-y-3 rounded-md border border-border p-3">
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
                className={`${fieldClass} h-9`}
              >
                {VENDOR_STATUSES.map((s) => (
                  <option key={s} value={s}>{VENDOR_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="vNotes">Notes</Label>
              <textarea
                id="vNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
                className={`${fieldClass} min-h-16 py-2`}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="outline" onClick={() => { setCreating(false); resetForm() }}>Cancel</Button>
            </div>
          </div>
        )}

        {vendors.length === 0 && !creating ? (
          <EmptyState
            icon={<Truck />}
            title="No vendors yet."
            description="Track the florists, caterers, and rentals this job depends on."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCreating(true); setError(null) }}
              >
                Add a vendor
              </Button>
            }
          />
        ) : (
          <div className="rounded-md border border-border">
            {ordered.map((v) => (
              <VendorRow
                key={v.id}
                vendor={v}
                busy={saving}
                onStatusChange={handleStatusChange}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        )}

        <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete vendor</DialogTitle>
              <DialogDescription>
                {pendingDelete
                  ? `“${pendingDelete.name}” will be removed from this job. This can't be undone.`
                  : ''}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button
                variant="destructive"
                disabled={saving}
                onClick={() => { if (pendingDelete) void handleDelete(pendingDelete) }}
              >
                Delete vendor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
