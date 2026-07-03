'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createVendor, updateVendor, deleteVendor } from '@/actions/vendors'
import { VENDOR_STATUSES, VENDOR_STATUS_LABELS, confirmedVendorCost, totalVendorCost } from '@/lib/vendors'
import type { Vendor, VendorStatus } from '@/lib/types'

interface LeadVendorsClientProps {
  orgId: string
  leadId: string
  vendors: Vendor[]
}

const money = (n: number) => `$${n.toFixed(2)}`

export function LeadVendorsClient({ orgId, leadId, vendors: initial }: LeadVendorsClientProps) {
  const [vendors, setVendors] = useState<Vendor[]>(initial)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (!confirm(`Delete "${vendor.name}"?`)) return
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
    <div className="p-6 pt-0 max-w-2xl space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Vendors</CardTitle>
            <p className="text-xs text-muted-foreground">
              Confirmed: {money(confirmedVendorCost(vendors))} · Est. total: {money(totalVendorCost(vendors))}
            </p>
          </div>
          {!creating && (
            <Button onClick={() => { setCreating(true); setError(null) }}>New vendor</Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
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
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
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
            <p className="text-sm text-muted-foreground">No vendors yet.</p>
          )}

          {vendors.map((v) => (
            <div key={v.id} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{v.name}</span>
                  {v.service && <Badge variant="secondary">{v.service}</Badge>}
                </div>
                {(v.contact_name || v.email || v.phone) && (
                  <p className="text-xs text-muted-foreground">
                    {[v.contact_name, v.email, v.phone].filter(Boolean).join(' · ')}
                  </p>
                )}
                {v.cost != null && <p className="text-xs text-muted-foreground">{money(v.cost)}</p>}
                {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={v.status}
                  onChange={(e) => handleStatusChange(v, e.target.value as VendorStatus)}
                  aria-label={`Status for ${v.name}`}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {VENDOR_STATUSES.map((s) => (
                    <option key={s} value={s}>{VENDOR_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => handleDelete(v)} disabled={saving}>Delete</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
