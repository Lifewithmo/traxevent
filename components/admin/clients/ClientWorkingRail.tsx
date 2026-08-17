'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { StatusPill, type pillVariants } from '@/components/ui/status-pill'
import { TagEditor } from '@/components/admin/TagEditor'
import { NewOpportunityForm } from '@/components/admin/pipeline/NewOpportunityForm'
import { updateCustomer } from '@/actions/customers'
import { listProposals } from '@/actions/proposals'
import { LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
import { proposalDisplayRange, PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import { invoiceAmountDue, invoiceBalance, amountPaid } from '@/lib/invoices'
import { derivePaymentStatus, deriveAging } from '@/lib/invoice-status'
import type {
  Customer, Lead, Invoice, Proposal, LeadStage, ProposalStatus, InvoicePaymentStatus,
} from '@/lib/types'
import type { CustomerAR } from '@/lib/crm/ar-rollup'
import type { VariantProps } from 'class-variance-authority'

type Tone = NonNullable<VariantProps<typeof pillVariants>['tone']>

interface ClientWorkingRailProps {
  orgId: string
  orgSlug: string
  customer: Customer
  opportunities: Lead[]
  invoices: Invoice[]
  ar: CustomerAR
}

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

// Blank -> null clears the field (CustomerUpdate maps it to FieldValue.delete()).
// Mirrors CustomerDetailClient's `opt` helper.
const opt = (v: string): string | null => (v.trim() === '' ? null : v.trim())

const JOB_TONE: Record<LeadStage, Tone> = {
  inquiry: 'neutral',
  consultation: 'pending',
  proposal: 'pending',
  closed_won: 'confirmed',
  closed_lost: 'alert',
}

const PROPOSAL_TONE: Record<ProposalStatus, Tone> = {
  draft: 'neutral',
  sent: 'pending',
  accepted: 'confirmed',
  rejected: 'alert',
  voided: 'alert',
}

const INVOICE_STATUS_LABELS: Record<InvoicePaymentStatus, string> = {
  not_due: 'Not due',
  due: 'Due',
  partial: 'Partial',
  paid: 'Paid',
  overpaid: 'Overpaid',
  refunded: 'Refunded',
  void: 'Void',
}

const INVOICE_TONE: Record<InvoicePaymentStatus, Tone> = {
  not_due: 'neutral',
  due: 'pending',
  partial: 'pending',
  paid: 'confirmed',
  overpaid: 'confirmed',
  refunded: 'neutral',
  void: 'neutral',
}

function byCreatedDesc<T extends { created_at?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

// Mirrors customerAR's own overdue bucket set (lib/crm/ar-rollup.ts), so a
// row's alert tone agrees with the AR footer's overdueAmount.
const OVERDUE_AGING_BUCKETS = new Set(['d1_30', 'd31_60', 'd61_90', 'd90_plus'])

// One click-to-edit fact: value or a "+ Add {label}" affordance, swapping to
// an input that commits via `onSave` on blur/Enter. Generalizes the
// page-level toggle in FactsGrid.tsx into a per-field toggle.
function EditableFact({
  label, value, onSave,
}: {
  label: string
  value: string
  onSave: (next: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)

  function startEditing() {
    setDraft(value)
    setEditing(true)
  }

  async function commit() {
    if (draft.trim() === value.trim()) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await onSave(draft)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {editing ? (
        <input
          autoFocus
          aria-label={label}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              setDraft(value)
              setEditing(false)
            }
          }}
          className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-0.5 text-sm"
        />
      ) : value ? (
        <dd className="mt-0.5">
          <button type="button" onClick={startEditing} title={value} className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline">
            {value}
          </button>
        </dd>
      ) : (
        <dd className="mt-0.5">
          <button type="button" onClick={startEditing} className="text-sm text-[var(--link)]">
            + Add {label}
          </button>
        </dd>
      )}
    </div>
  )
}

// Metadata block: click-to-edit facts backed by the existing `updateCustomer`
// action. Only fields present on `Customer`/`CustomerUpdate` are editable here
// (email, phone, company, tags) — the brief also names Source/Owner/Booking
// default, but no such fields exist on `Customer` or `CustomerUpdate`
// (actions/customers.ts) anywhere in the codebase, so they're omitted rather
// than invented. See task-19-report.md.
function MetadataCard({ orgId, customer }: { orgId: string; customer: Customer }) {
  const router = useRouter()

  async function saveField(field: 'email' | 'phone' | 'company', value: string) {
    await updateCustomer(orgId, customer.id, { [field]: opt(value) })
    router.refresh()
  }

  async function saveTags(next: string[]) {
    await updateCustomer(orgId, customer.id, { tags: next })
    router.refresh()
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="border-b border-border px-3 py-2">
        <h4 className="text-[13px] font-semibold">Details</h4>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-3">
        <EditableFact label="Email" value={customer.email ?? ''} onSave={(v) => saveField('email', v)} />
        <EditableFact label="Phone" value={customer.phone ?? ''} onSave={(v) => saveField('phone', v)} />
        <EditableFact label="Company" value={customer.company ?? ''} onSave={(v) => saveField('company', v)} />
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Tags</dt>
          <dd className="mt-0.5">
            <TagEditor tags={customer.tags ?? []} suggestions={[]} onSave={saveTags} />
          </dd>
        </div>
      </dl>
    </section>
  )
}

export function ClientWorkingRail({ orgId, orgSlug, customer, opportunities, invoices, ar }: ClientWorkingRailProps) {
  const router = useRouter()
  const [creatingJob, setCreatingJob] = useState(false)
  const [proposals, setProposals] = useState<Proposal[]>([])

  // Proposals aren't loaded by the customer-page loader (only invoices are,
  // via listInvoicesByCustomerCore) — fan out across this customer's
  // opportunities using the existing per-lead action.
  useEffect(() => {
    let cancelled = false
    // Promise.all([]) still resolves (asynchronously) to [], so this also
    // clears stale proposals when navigating to a customer with no jobs.
    Promise.all(opportunities.map((o) => listProposals(orgId, o.id)))
      .then((lists) => {
        if (!cancelled) setProposals(lists.flat())
      })
      .catch(() => {
        if (!cancelled) setProposals([])
      })
    return () => {
      cancelled = true
    }
  }, [orgId, opportunities])

  const sortedOpportunities = byCreatedDesc(opportunities)
  const mostRecentLeadId = sortedOpportunities[0]?.id

  const jobRows: RelatedRow[] = sortedOpportunities.map((o) => ({
    id: o.id,
    title: opportunityTitle(o),
    subtitle: [o.event_date, LEAD_STAGE_LABELS[o.stage]].filter(Boolean).join(' · '),
    badge: <StatusPill tone={JOB_TONE[o.stage]}>{LEAD_STAGE_LABELS[o.stage]}</StatusPill>,
    amount: o.estimated_value != null ? money(o.estimated_value) : undefined,
    href: `/${orgSlug}/leads/${o.id}`,
  }))

  const proposalRows: RelatedRow[] = byCreatedDesc(proposals).map((p) => {
    const { min, max } = proposalDisplayRange(p)
    return {
      id: p.id,
      title: p.title || 'Untitled proposal',
      subtitle: PROPOSAL_STATUS_LABELS[p.status],
      badge: <StatusPill tone={PROPOSAL_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</StatusPill>,
      amount: min === max ? money(min) : `${money(min)}–${money(max)}`,
      href: `/${orgSlug}/leads/${p.lead_id}/proposals/${p.id}`,
    }
  })

  const now = new Date()
  const invoiceRows: RelatedRow[] = byCreatedDesc(invoices).map((inv) => {
    const total = invoiceAmountDue(inv)
    const applied = amountPaid(inv.payments)
    const balance = invoiceBalance(inv)
    const status = derivePaymentStatus({ total, applied, lifecycle: inv.lifecycle ?? 'sent', dueDate: inv.due_date }, now)
    const aging = deriveAging({ dueDate: inv.due_date, balance, lifecycle: inv.lifecycle ?? 'sent' }, now)
    const overdue = inv.lifecycle === 'sent' && OVERDUE_AGING_BUCKETS.has(aging)
    return {
      id: inv.id,
      title: inv.number ? `Invoice ${inv.number}` : inv.title || 'Invoice',
      subtitle: inv.due_date ? `Due ${inv.due_date}` : undefined,
      badge: <StatusPill tone={INVOICE_TONE[status]}>{INVOICE_STATUS_LABELS[status]}</StatusPill>,
      amount: money(balance),
      amountTone: overdue ? 'alert' : 'default',
      href: `/${orgSlug}/leads/${inv.lead_id}/invoices/${inv.id}`,
    }
  })

  function goToNewProposal() {
    if (mostRecentLeadId) router.push(`/${orgSlug}/leads/${mostRecentLeadId}/proposals/new`)
    else setCreatingJob(true)
  }

  function goToInvoices() {
    // No standalone invoices list route exists for a lead — invoices render
    // inside the lead detail page itself (only .../invoices/[invoiceId]
    // has a page.tsx). Route to the lead detail, not a nonexistent list page.
    if (mostRecentLeadId) router.push(`/${orgSlug}/leads/${mostRecentLeadId}`)
    else setCreatingJob(true)
  }

  const invoiceFooter = (
    <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
      <span className="font-medium text-muted-foreground">Open balance</span>
      <div className="flex items-baseline gap-2">
        <span className={cn('font-semibold tabular-nums', ar.overdueAmount > 0 ? 'text-destructive' : 'text-foreground')}>
          {money(ar.outstanding)}
        </span>
        {ar.nextDueDate ? <span className="text-muted-foreground">Next due {ar.nextDueDate}</span> : null}
      </div>
    </div>
  )

  return (
    <aside className="space-y-4 lg:col-span-2">
      <MetadataCard orgId={orgId} customer={customer} />

      {/* Empty context blocks (no rows, just an empty-state CTA) hide below md —
          they're a "here's how to add one" invitation that costs real scroll
          distance on a phone screen queued behind the record itself. */}
      <RelatedRecordCard
        title="Jobs"
        count={jobRows.length}
        rows={jobRows}
        emptyTitle="No jobs yet"
        emptyCtaLabel="Book a job"
        onEmptyCta={() => setCreatingJob(true)}
        className={jobRows.length === 0 ? 'max-md:hidden' : undefined}
      />

      <RelatedRecordCard
        title="Proposals"
        count={proposalRows.length}
        rows={proposalRows}
        emptyTitle="No proposals yet"
        emptyCtaLabel="Draft one"
        onEmptyCta={goToNewProposal}
        className={proposalRows.length === 0 ? 'max-md:hidden' : undefined}
      />

      <RelatedRecordCard
        title="Invoices"
        count={invoiceRows.length}
        rows={invoiceRows}
        emptyTitle="No invoices yet"
        emptyCtaLabel="Create invoice"
        onEmptyCta={goToInvoices}
        footer={invoiceFooter}
        className={invoiceRows.length === 0 ? 'max-md:hidden' : undefined}
      />

      <NewOpportunityForm orgId={orgId} open={creatingJob} onClose={() => setCreatingJob(false)} customer={customer} />
    </aside>
  )
}
