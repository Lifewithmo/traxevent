'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, Phone } from 'lucide-react'
import { createNote } from '@/actions/notes'
import { updateCustomer } from '@/actions/customers'
import { LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
import { formatRelativeTime } from '@/lib/opportunity-detail'
import { NewOpportunityForm } from '@/components/admin/pipeline/NewOpportunityForm'
import { TagEditor } from '@/components/admin/TagEditor'
import type { CustomerRollup } from '@/lib/crm/customer-rollup'
import type { Customer, Lead, Note } from '@/lib/types'

interface CustomerDetailClientProps {
  orgId: string
  orgSlug: string
  customer: Customer
  opportunities: Lead[]
  rollup: CustomerRollup
  notes: Note[]
  orgTags: string[]
}

// Blank -> null (clears the field via CustomerUpdate's FieldValue.delete() mapping);
// otherwise the trimmed value. `undefined` is never sent — every field is always
// part of the save payload, matching OpportunityDetailsForm's `opt` helper.
const opt = (v: string): string | null => (v.trim() === '' ? null : v.trim())

export function CustomerDetailClient({ orgId, orgSlug, customer, opportunities, rollup, notes, orgTags }: CustomerDetailClientProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(customer.name)
  const [company, setCompany] = useState(customer.company ?? '')
  const [email, setEmail] = useState(customer.email ?? '')
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [contactBusy, setContactBusy] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)
  const [contactNotice, setContactNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleAddNote() {
    if (!body.trim()) return
    setBusy(true); setError(null)
    try {
      await createNote(orgId, { parent_type: 'customer', parent_id: customer.id, body: body.trim() })
      setBody(''); router.refresh()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not add note') }
    finally { setBusy(false) }
  }

  async function handleSaveContact() {
    if (!name.trim()) { setContactError('Name is required.'); setContactNotice(null); return }
    setContactBusy(true); setContactError(null); setContactNotice(null)
    try {
      await updateCustomer(orgId, customer.id, {
        name: name.trim(),
        company: opt(company),
        email: opt(email),
        phone: opt(phone),
      })
      setContactNotice('Saved.')
      router.refresh()
    } catch (e: unknown) { setContactError(e instanceof Error ? e.message : 'Could not save contact details') }
    finally { setContactBusy(false) }
  }

  const sortedOpportunities = [...opportunities].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const tags = customer.tags ?? []

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href={`/${orgSlug}/clients`} className="text-sm text-muted-foreground hover:underline">
        ← Back to clients
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          {customer.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
          <TagEditor
            tags={tags}
            suggestions={orgTags}
            onSave={async (next) => {
              await updateCustomer(orgId, customer.id, { tags: next })
              router.refresh()
            }}
          />
        </div>
        <div className="flex gap-2">
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              <Mail className="h-4 w-4" /> Email
            </a>
          )}
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
          )}
          <Button size="sm" onClick={() => setCreating(true)}>New opportunity</Button>
        </div>
      </div>

      <NewOpportunityForm orgId={orgId} open={creating} onClose={() => setCreating(false)} customer={customer} />

      <Card>
        <CardHeader><CardTitle className="text-base">Contact details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {contactError && <p className="text-sm text-destructive" role="alert">{contactError}</p>}
          {contactNotice && <p className="text-sm text-muted-foreground">{contactNotice}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="custName">Name</Label>
              <Input id="custName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="custCompany">Company</Label>
              <Input id="custCompany" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="custEmail">Email</Label>
              <Input id="custEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="custPhone">Phone</Label>
              <Input id="custPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
            </div>
          </div>
          <div>
            <Button size="sm" onClick={handleSaveContact} disabled={contactBusy}>
              {contactBusy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Lifetime won</p>
          <p className="text-xl font-semibold">${rollup.totalWonValue.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Open</p>
          <p className="text-xl font-semibold">{rollup.openCount} · ${rollup.openValue.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Won / Lost</p>
          <p className="text-xl font-semibold">{rollup.wonCount} / {rollup.lostCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Last contact</p>
          <p className="text-xl font-semibold">
            {rollup.lastContactAt ? formatRelativeTime(rollup.lastContactAt) : '—'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Opportunities</CardTitle></CardHeader>
        <CardContent>
          {sortedOpportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No opportunities yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Opportunity</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Stage</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Event date</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOpportunities.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/${orgSlug}/leads/${l.id}`} className="hover:underline">{opportunityTitle(l)}</Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{LEAD_STAGE_LABELS[l.stage]}</Badge>
                      </td>
                      <td className="px-3 py-2">{l.event_date ?? '—'}</td>
                      <td className="px-3 py-2 text-right">${(l.estimated_value ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a note…"
              className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAddNote} disabled={busy || !body.trim()}>Add note</Button>
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>

          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id}>
                  <p className="text-sm">{n.body}</p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
