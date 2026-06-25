'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateLead, deleteLead, type LeadUpdate } from '@/actions/leads'
import { LEAD_STAGES, LEAD_STAGE_LABELS } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

interface LeadDetailClientProps {
  orgId: string
  orgSlug: string
  lead: Lead
}

export function LeadDetailClient({ orgId, orgSlug, lead }: LeadDetailClientProps) {
  const router = useRouter()

  const [name, setName] = useState(lead.name)
  const [organization, setOrganization] = useState(lead.organization ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [eventType, setEventType] = useState(lead.event_type ?? '')
  const [eventDate, setEventDate] = useState(lead.event_date ?? '')
  const [estimatedValue, setEstimatedValue] = useState(
    lead.estimated_value != null ? String(lead.estimated_value) : ''
  )
  const [stage, setStage] = useState<LeadStage>(lead.stage)
  const [notes, setNotes] = useState(lead.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Trim a text field: a non-empty value sets it, an empty value clears it (null).
  const opt = (v: string): string | null => (v.trim() === '' ? null : v.trim())

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); setNotice(null); return }
    setSaving(true); setError(null); setNotice(null)
    try {
      const parsed = estimatedValue.trim() === '' ? null : Number(estimatedValue)
      if (parsed != null && Number.isNaN(parsed)) {
        setError('Estimated value must be a number.')
        return
      }
      const updates: LeadUpdate = {
        name: name.trim(),
        organization: opt(organization),
        email: opt(email),
        phone: opt(phone),
        event_type: opt(eventType),
        event_date: opt(eventDate),
        estimated_value: parsed,
        stage,
        notes: opt(notes),
      }
      await updateLead(orgId, lead.id, updates)
      setNotice('Saved.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return
    setDeleting(true); setError(null); setNotice(null)
    try {
      await deleteLead(orgId, lead.id)
      router.push(`/${orgSlug}/leads`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <Link href={`/${orgSlug}/leads`} className="text-sm text-muted-foreground hover:underline">
          ← Back to pipeline
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{lead.name}</h1>
        <Button variant="destructive" onClick={handleDelete} disabled={deleting || saving}>
          {deleting ? 'Deleting…' : 'Delete lead'}
        </Button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lead details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
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
          <div className="space-y-1">
            <Label htmlFor="leadEventType">Event type</Label>
            <Input id="leadEventType" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g. Wedding" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="leadEventDate">Event date</Label>
            <Input id="leadEventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="leadValue">Estimated value</Label>
            <Input id="leadValue" type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="leadStage">Stage</Label>
            <select
              id="leadStage"
              value={stage}
              onChange={(e) => setStage(e.target.value as LeadStage)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="leadNotes">Notes</Label>
            <textarea
              id="leadNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || deleting || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
