'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createNote } from '@/actions/notes'
import { updateCustomer } from '@/actions/customers'
import { buildClientRow } from '@/lib/crm/client-list'
import { buildClientStory, buildTimeline, todayDividerIndex, type TimelineEntry } from '@/lib/crm/client-story'
import { formatRelativeTime, todayYmd } from '@/lib/opportunity-detail'
import { NewOpportunityForm } from '@/components/admin/pipeline/NewOpportunityForm'
import { TagEditor } from '@/components/admin/TagEditor'
import type { Customer, Lead, Note } from '@/lib/types'

interface CustomerDetailClientProps {
  orgId: string
  orgSlug: string
  customer: Customer
  opportunities: Lead[]
  notes: Note[]
  orgTags: string[]
}

// Blank -> null clears the field (CustomerUpdate maps it to FieldValue.delete()).
const opt = (v: string): string | null => (v.trim() === '' ? null : v.trim())

// Mirrors lib/crm/customers.normalizeTags (trim, drop empties, case-insensitive
// dedupe keeping first casing). Reimplemented locally rather than imported: that
// module pulls in `adminDb` from '@/lib/firebase-admin' at module scope, which is
// server-only and unsafe to drag into this client component.
function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

const INITIAL_TIMELINE = 4

function ContactLine({
  orgId,
  customer,
  onSaved,
}: {
  orgId: string
  customer: Customer
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(customer.name)
  const [company, setCompany] = useState(customer.company ?? '')
  const [email, setEmail] = useState(customer.email ?? '')
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateCustomer(orgId, customer.id, {
        name: name.trim(),
        company: opt(company),
        email: opt(email),
        phone: opt(phone),
      })
      setEditing(false)
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save contact details')
    } finally {
      setBusy(false)
    }
  }

  // At rest this is one line of text, not four inputs and a Save button.
  if (!editing) {
    return (
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[customer.name, customer.email, customer.phone].filter(Boolean).join(' · ')}{' '}
        <button type="button" onClick={() => setEditing(true)} className="text-foreground underline">
          edit
        </button>
      </p>
    )
  }

  return (
    <div className="mt-2 grid max-w-md gap-2 sm:grid-cols-2">
      {[
        { id: 'name', label: 'Name', v: name, set: setName, ph: 'Contact name' },
        { id: 'company', label: 'Company', v: company, set: setCompany, ph: 'Company' },
        { id: 'email', label: 'Email', v: email, set: setEmail, ph: 'name@example.com' },
        { id: 'phone', label: 'Phone', v: phone, set: setPhone, ph: '(555) 555-5555' },
      ].map((f) => (
        <input
          key={f.id}
          aria-label={f.label}
          value={f.v}
          placeholder={f.ph}
          onChange={(e) => f.set(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        />
      ))}
      <div className="col-span-full flex items-center gap-3 text-xs">
        <button type="button" onClick={save} disabled={busy} className="rounded bg-foreground px-2.5 py-1 text-background">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-muted-foreground underline">
          Cancel
        </button>
        {error && (
          <span className="text-destructive" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}

function TimelineRow({ entry, orgSlug }: { entry: TimelineEntry; orgSlug: string }) {
  const muted = entry.kind === 'lost' || entry.kind === 'past'
  return (
    <div className="flex items-start gap-3 border-b border-border/60 py-2.5">
      <div className={`w-14 shrink-0 font-mono text-xs font-semibold ${muted ? 'text-muted-foreground' : ''}`}>
        {entry.date ? entry.date.slice(5) : '—'}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/${orgSlug}/leads/${entry.leadId}`}
          className={`text-sm hover:underline ${entry.kind === 'lost' ? 'text-muted-foreground' : muted ? '' : 'font-semibold'}`}
        >
          {entry.title}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
      </div>
      {entry.value !== undefined && (
        <div className={`shrink-0 text-sm tabular-nums ${muted ? 'text-muted-foreground' : ''}`}>
          ${entry.value.toLocaleString()}
        </div>
      )}
    </div>
  )
}

export function CustomerDetailClient({ orgId, orgSlug, customer, opportunities, notes, orgTags }: CustomerDetailClientProps) {
  const router = useRouter()
  const today = todayYmd()
  const [body, setBody] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [tags, setTags] = useState(customer.tags ?? [])

  const row = buildClientRow(customer, opportunities, today)
  const story = buildClientStory(row, opportunities)
  const timeline = buildTimeline(opportunities, today)
  const dividerAt = todayDividerIndex(timeline, today)
  const shown = expanded ? timeline : timeline.slice(0, INITIAL_TIMELINE)

  async function handleAddNote() {
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createNote(orgId, { parent_type: 'customer', parent_id: customer.id, body: body.trim() })
      setBody('')
      setAdding(false)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not add note')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-5">
      <Link href={`/${orgSlug}/clients`} className="text-xs text-muted-foreground hover:underline">
        ← Clients
      </Link>

      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">{customer.company || customer.name}</h1>
          <ContactLine orgId={orgId} customer={customer} onSaved={() => router.refresh()} />
          <TagEditor
            tags={tags}
            suggestions={orgTags}
            onSave={async (next) => {
              const previous = tags
              setTags(normalizeTags(next))
              try {
                await updateCustomer(orgId, customer.id, { tags: next })
                router.refresh()
              } catch (e) {
                setTags(previous)
                throw e
              }
            }}
          />
        </div>
        <div className="flex shrink-0 gap-2 text-xs">
          {customer.email && (
            <a href={`mailto:${customer.email}`} className="rounded border border-border px-2.5 py-1 text-muted-foreground">
              Email
            </a>
          )}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded bg-foreground px-2.5 py-1 text-background"
          >
            New opportunity
          </button>
        </div>
      </div>

      <NewOpportunityForm orgId={orgId} open={creating} onClose={() => setCreating(false)} customer={customer} />

      {story.parts.length > 0 && (
        <p
          className={`mt-3.5 border-y py-3 text-sm leading-relaxed ${story.dormant ? 'border-destructive/25' : 'border-border'}`}
        >
          {story.parts.join('. ')}.
        </p>
      )}

      <h2 className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Timeline</h2>
      <div className="mt-1">
        {shown.map((entry, i) => (
          <div key={entry.leadId}>
            {i === dividerAt && (
              <div className="flex items-center gap-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-destructive">
                <span>Today · {today.slice(5)}</span>
                <span className="h-px flex-1 bg-destructive/25" />
              </div>
            )}
            <TimelineRow entry={entry} orgSlug={orgSlug} />
          </div>
        ))}
        {timeline.length === 0 && <p className="py-2 text-sm text-muted-foreground">Nothing yet.</p>}
        {!expanded && timeline.length > INITIAL_TIMELINE && (
          <button type="button" onClick={() => setExpanded(true)} className="py-2 text-xs underline">
            Show {timeline.length - INITIAL_TIMELINE} more
          </button>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Notes</h2>
          <button type="button" onClick={() => setAdding((v) => !v)} className="text-xs underline">
            + Add
          </button>
        </div>

        {adding && (
          <div className="mt-2 space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What should you remember about them?"
              className="min-h-16 w-full rounded border border-border bg-transparent px-2.5 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={busy || !body.trim()}
              className="rounded bg-foreground px-2.5 py-1 text-xs text-background disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Add note'}
            </button>
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {notes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="mt-2.5 space-y-2.5">
            {notes.map((n) => (
              <li key={n.id}>
                <p className="text-sm">{n.body}</p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
