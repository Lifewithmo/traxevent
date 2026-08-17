import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { StatusPill, type pillVariants } from '@/components/ui/status-pill'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
import { proposalDisplayRange, PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import { invoiceAmountDue, invoiceBalance, amountPaid } from '@/lib/invoices'
import { derivePaymentStatus, deriveAging } from '@/lib/invoice-status'
import type { DayDetail } from '@/actions/calendar'
import type { RunwayJob } from '@/lib/calendar-cashflow'
import type { CalendarItem } from '@/lib/calendar'
import type { Event, LeadStage, ProposalStatus, InvoicePaymentStatus } from '@/lib/types'
import type { VariantProps } from 'class-variance-authority'

// The live-swapping right pane. Deep-linkable at /calendar/[ymd]; on selection
// it re-renders on the server and streams in (App-Router master-detail, mirroring
// the Clients cockpit). The row mappings below are the ClientWorkingRail pattern
// verbatim so a job / proposal / invoice reads the same everywhere.

type Tone = NonNullable<VariantProps<typeof pillVariants>['tone']>

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

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

// Mirrors customerAR's overdue bucket set (lib/crm/ar-rollup.ts).
const OVERDUE_AGING_BUCKETS = new Set(['d1_30', 'd31_60', 'd61_90', 'd90_plus'])

function fullDayLabel(ymd: string): string {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

interface DaySpineProps {
  orgSlug: string
  today: string
  /** getDayDetail() output for the shown day. */
  detail: DayDetail
  /** buildRunway() output — the per-event line uses the entry keyed by eventId. */
  runway?: RunwayJob[]
}

function EventBlock({
  orgSlug,
  event,
  related,
  runwayJob,
  now,
}: {
  orgSlug: string
  event: Event
  related: DayDetail['related'][string] | undefined
  runwayJob: RunwayJob | undefined
  now: Date
}) {
  const job = related?.job ?? null
  const proposals = related?.proposals ?? []
  const invoices = related?.invoices ?? []

  const jobRows: RelatedRow[] = job
    ? [
        {
          id: job.id,
          title: opportunityTitle(job),
          subtitle: [job.event_date, LEAD_STAGE_LABELS[job.stage]].filter(Boolean).join(' · '),
          badge: <StatusPill tone={JOB_TONE[job.stage]}>{LEAD_STAGE_LABELS[job.stage]}</StatusPill>,
          amount: job.estimated_value != null ? money(job.estimated_value) : undefined,
          href: `/${orgSlug}/leads/${job.id}`,
        },
      ]
    : []

  const proposalRows: RelatedRow[] = proposals.map((p) => {
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

  const invoiceRows: RelatedRow[] = invoices.map((inv) => {
    const total = invoiceAmountDue(inv)
    const applied = amountPaid(inv.payments)
    const balance = invoiceBalance(inv)
    const status = derivePaymentStatus(
      { total, applied, lifecycle: inv.lifecycle ?? 'sent', dueDate: inv.due_date },
      now
    )
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

  const time = event.hours ? `${event.hours.start} – ${event.hours.end}` : 'Time TBD'

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-xs">
      <header>
        <Link href={`/${orgSlug}/${event.slug}/dashboard`} className="text-sm font-semibold text-foreground hover:underline">
          {event.name}
        </Link>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{time}</p>
        {runwayJob && runwayJob.inflowBefore > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-[var(--money-green)]">
              {formatMoney(runwayJob.inflowBefore)}
            </span>{' '}
            expected to land before this job
          </p>
        ) : null}
      </header>

      {jobRows.length > 0 ? (
        <RelatedRecordCard title="Job" count={jobRows.length} rows={jobRows} emptyTitle="No linked job" />
      ) : null}
      {proposalRows.length > 0 ? (
        <RelatedRecordCard title="Proposals" count={proposalRows.length} rows={proposalRows} emptyTitle="No proposals" />
      ) : null}
      {invoiceRows.length > 0 ? (
        <RelatedRecordCard title="Invoices" count={invoiceRows.length} rows={invoiceRows} emptyTitle="No invoices" />
      ) : null}
    </section>
  )
}

function SpineList({
  label,
  items,
  tone = 'default',
}: {
  label: string
  items: CalendarItem[]
  tone?: 'default' | 'alert'
}) {
  if (items.length === 0) return null
  return (
    <section aria-label={label}>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{label}</h3>
      <ul role="list" className="space-y-1">
        {items.map((i) => (
          <li key={`${i.kind}:${i.id}`}>
            <Link
              href={i.href}
              className={cn(
                'block rounded-md border border-border bg-card px-2.5 py-2 transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none',
                tone === 'alert' && 'border-l-2 border-l-destructive'
              )}
            >
              <span className={cn('block text-[13px] font-medium', tone === 'alert' ? 'text-destructive' : 'text-foreground')}>
                {i.title}
              </span>
              {i.detail ? <span className="block truncate text-xs text-muted-foreground">{i.detail}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function DaySpine({ orgSlug, today, detail, runway = [] }: DaySpineProps) {
  const now = new Date()
  const runwayByEvent = new Map(runway.map((r) => [r.eventId, r]))
  const isToday = detail.ymd === today
  const isEmpty =
    detail.events.length === 0 &&
    detail.tasks.length === 0 &&
    detail.blockers.length === 0 &&
    detail.drops.length === 0

  return (
    <aside aria-label="Day detail" className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-background">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{fullDayLabel(detail.ymd)}</h2>
        {isToday ? (
          <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">today</span>
        ) : null}
      </header>

      {isEmpty ? (
        <EmptyState
          title="Nothing scheduled"
          description="Booked jobs, drops, tasks and due dates for this day land here."
          className="px-5 py-12"
          action={
            <Link
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              href={`/${orgSlug}/new-event?date=${detail.ymd}`}
            >
              Book a job
            </Link>
          }
        />
      ) : (
        <div className="space-y-4 p-4">
          {detail.events.map((event) => (
            <EventBlock
              key={event.id}
              orgSlug={orgSlug}
              event={event}
              related={detail.related[event.id]}
              runwayJob={runwayByEvent.get(event.id)}
              now={now}
            />
          ))}

          {/* Blockers fold in here (decision #3) — no separate attention rail. */}
          <SpineList label="Blocking" items={detail.blockers} tone="alert" />
          <SpineList label="Prep tasks" items={detail.tasks} />
          <SpineList label="Drop pickups" items={detail.drops} />
        </div>
      )}
    </aside>
  )
}
