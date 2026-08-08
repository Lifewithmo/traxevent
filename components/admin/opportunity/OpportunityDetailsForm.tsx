'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateLead } from '@/actions/leads'
import type { LeadUpdate } from '@/lib/crm/leads'
import type { Customer, Lead } from '@/lib/types'

interface OpportunityDetailsFormProps {
  orgId: string
  orgSlug: string
  lead: Lead
  customer: Customer | null
}

export function OpportunityDetailsForm({ orgId, orgSlug, lead, customer }: OpportunityDetailsFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(lead.title ?? '')
  const [name, setName] = useState(lead.name)
  const [organization, setOrganization] = useState(lead.organization ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [eventType, setEventType] = useState(lead.event_type ?? '')
  const [eventDate, setEventDate] = useState(lead.event_date ?? '')
  const [estimatedValue, setEstimatedValue] = useState(lead.estimated_value != null ? String(lead.estimated_value) : '')
  const [guestCount, setGuestCount] = useState(lead.guest_count != null ? String(lead.guest_count) : '')
  const [notes, setNotes] = useState(lead.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const opt = (v: string): string | null => (v.trim() === '' ? null : v.trim())

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); setNotice(null); return }
    setSaving(true); setError(null); setNotice(null)
    try {
      const parsed = estimatedValue.trim() === '' ? null : Number(estimatedValue)
      if (parsed != null && Number.isNaN(parsed)) { setError('Estimated value must be a number.'); return }
      const guests = guestCount.trim() === '' ? null : Number(guestCount)
      if (guests != null && Number.isNaN(guests)) { setError('Guest count must be a number.'); return }
      const updates: LeadUpdate = {
        title: title.trim() || null,
        name: name.trim(),
        organization: opt(organization),
        email: opt(email),
        phone: opt(phone),
        event_type: opt(eventType),
        event_date: opt(eventDate),
        estimated_value: parsed,
        guest_count: guests,
        notes: opt(notes),
      }
      await updateLead(orgId, lead.id, updates)
      setNotice('Saved.')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div aria-live="polite" aria-atomic="true">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="oppTitle">Title</Label>
          <Input id="oppTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Riverside gala" />
        </div>
        {!customer && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="oppName">Name</Label>
              <Input id="oppName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="oppOrg">Organization</Label>
              <Input id="oppOrg" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Company" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="oppEmail">Email</Label>
              <Input id="oppEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="oppPhone">Phone</Label>
              <Input id="oppPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
            </div>
          </div>
        )}
        {customer && (
          <p className="text-sm text-muted-foreground">
            Contact details live on the customer record.{' '}
            <Link href={`/${orgSlug}/clients/${customer.id}`} className="underline">Edit {customer.name}</Link>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="oppEventType">Event type</Label>
            <Input id="oppEventType" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g. Wedding" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppEventDate">Event date</Label>
            <Input id="oppEventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppValue">Estimated value</Label>
            <Input id="oppValue" type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oppGuests">Guest count</Label>
            <Input id="oppGuests" type="number" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} placeholder="Estimate" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="oppNotes">Notes</Label>
          <textarea
            id="oppNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
