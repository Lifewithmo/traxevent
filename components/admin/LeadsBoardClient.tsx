'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createLead, setLeadStage } from '@/actions/leads'
import { LEAD_STAGES, LEAD_STAGE_LABELS, groupLeadsByStage, pipelineSummary } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

interface LeadsBoardClientProps {
  orgId: string
  orgSlug: string
  leads: Lead[]
}

const money = (n: number) => `$${n.toLocaleString()}`

export function LeadsBoardClient({ orgId, orgSlug, leads: initial }: LeadsBoardClientProps) {
  const [leads, setLeads] = useState<Lead[]>(initial)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [organization, setOrganization] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [notes, setNotes] = useState('')

  const grouped = groupLeadsByStage(leads)
  const summary = pipelineSummary(leads)

  function resetForm() {
    setName(''); setOrganization(''); setEmail(''); setPhone('')
    setEventType(''); setEventDate(''); setEstimatedValue(''); setNotes('')
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError(null)
    try {
      const parsedValue = estimatedValue.trim() === '' ? undefined : Number(estimatedValue)
      const lead = await createLead(orgId, {
        name: name.trim(),
        organization: organization.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        event_type: eventType.trim() || undefined,
        event_date: eventDate.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(parsedValue != null && !Number.isNaN(parsedValue) ? { estimated_value: parsedValue } : {}),
      })
      setLeads((prev) => [lead, ...prev])
      setCreating(false); resetForm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally { setSaving(false) }
  }

  async function handleStageChange(lead: Lead, newStage: LeadStage) {
    if (newStage === lead.stage) return
    setError(null)
    const prev = leads
    setLeads((p) => p.map((l) => (l.id === lead.id ? { ...l, stage: newStage } : l)))
    try {
      await setLeadStage(orgId, lead.id, newStage)
    } catch (err: unknown) {
      setLeads(prev)
      setError(err instanceof Error ? err.message : 'Failed to move lead')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        {!creating && <Button onClick={() => { setCreating(true); setError(null) }}>New lead</Button>}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">Open: {summary.openCount} leads · {money(summary.openValue)}</Badge>
        <Badge variant="secondary">Booked: {money(summary.bookedValue)}</Badge>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {creating && (
        <Card>
          <CardHeader><CardTitle className="text-base">New lead</CardTitle></CardHeader>
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
              <Button onClick={handleCreate} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="outline" onClick={() => { setCreating(false); resetForm() }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 overflow-x-auto">
        {LEAD_STAGES.map((stage) => (
          <div key={stage} className="min-w-[220px] flex-1 space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">{LEAD_STAGE_LABELS[stage]}</h2>
              <Badge variant="outline">{grouped[stage].length}</Badge>
            </div>
            <div className="space-y-2">
              {grouped[stage].map((lead) => (
                <Card key={lead.id}>
                  <CardContent className="py-3 space-y-2">
                    <Link href={`/${orgSlug}/leads/${lead.id}`} className="block space-y-1">
                      <p className="text-sm font-medium">{lead.name}</p>
                      {lead.organization && <p className="text-xs text-muted-foreground">{lead.organization}</p>}
                      {(lead.event_type || lead.event_date) && (
                        <p className="text-xs text-muted-foreground">
                          {[lead.event_type, lead.event_date].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {lead.estimated_value != null && (
                        <p className="text-xs font-medium">{money(lead.estimated_value)}</p>
                      )}
                    </Link>
                    <select
                      value={lead.stage}
                      onChange={(e) => handleStageChange(lead, e.target.value as LeadStage)}
                      aria-label={`Stage for ${lead.name}`}
                      className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {LEAD_STAGES.map((s) => (
                        <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>
                      ))}
                    </select>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
