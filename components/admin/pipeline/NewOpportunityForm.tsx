'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createLead } from '@/actions/leads'
import type { Customer } from '@/lib/types'

interface NewOpportunityFormProps {
  orgId: string
  open: boolean
  onClose: () => void
  customer?: Customer
}

export function NewOpportunityForm({ orgId, open, onClose, customer }: NewOpportunityFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const linked = customer ?? null

  const [title, setTitle] = useState('')
  const [name, setName] = useState('')
  const [organization, setOrganization] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [notes, setNotes] = useState('')

  function resetForm() {
    setTitle(''); setName(''); setOrganization(''); setEmail(''); setPhone('')
    setEventType(''); setEventDate(''); setGuestCount(''); setEstimatedValue(''); setNotes('')
    setError(null)
  }

  async function handleCreate() {
    if (!linked && !name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError(null)
    try {
      const parsedValue = estimatedValue.trim() === '' ? undefined : Number(estimatedValue)
      const parsedGuests = guestCount.trim() === '' ? undefined : Number(guestCount)
      await createLead(orgId, {
        ...(linked
          ? { customer_id: linked.id }
          : {
              name: name.trim(),
              organization: organization.trim() || undefined,
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
            }),
        title: title.trim() || undefined,
        event_type: eventType.trim() || undefined,
        event_date: eventDate.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(parsedValue != null && !Number.isNaN(parsedValue) ? { estimated_value: parsedValue } : {}),
        ...(parsedGuests != null && !Number.isNaN(parsedGuests) ? { guest_count: parsedGuests } : {}),
      })
      resetForm()
      onClose()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">New opportunity</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div aria-live="polite" aria-atomic="true">
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        {linked && (
          <p className="text-sm text-muted-foreground">
            For {linked.name}{linked.company ? ` · ${linked.company}` : ''}
          </p>
        )}
        <div className="space-y-1">
          <Label htmlFor="leadTitle">Title</Label>
          <Input id="leadTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Riverside gala" />
        </div>
        {!linked && (
          <>
            <div className="space-y-1">
              <Label htmlFor="leadName">Name</Label>
              <Input id="leadName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leadOrg">Organization</Label>
              <Input id="leadOrg" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Company / organization" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leadEmail">Email</Label>
              <Input id="leadEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leadPhone">Phone</Label>
              <Input id="leadPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label htmlFor="leadEventType">Event type</Label>
          <Input id="leadEventType" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g. Wedding" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="leadEventDate">Event date</Label>
          <Input id="leadEventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="leadGuestCount">Guest count</Label>
          <Input id="leadGuestCount" type="number" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="leadValue">Estimated value</Label>
          <Input id="leadValue" type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="leadNotes">Notes</Label>
          <textarea
            id="leadNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreate} disabled={saving || (!linked && !name.trim())}>{saving ? 'Saving…' : 'Save'}</Button>
          <Button variant="outline" onClick={() => { resetForm(); onClose() }}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  )
}
