import Link from 'next/link'
import { MapPin, Phone, PhoneOff } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { RelatedRecordCard, type RelatedRow } from '@/components/ui/related-record-card'
import { StatusPill, type pillVariants } from '@/components/ui/status-pill'
import { KindDot } from '@/components/admin/calendar/KindDot'
import { BookabilityMark, verdictTone } from '@/components/admin/calendar/BookabilityMark'
import {
  shortDayLabel,
  weekdayName,
  VERDICT_LABEL,
  type Bookability,
} from '@/lib/calendar-bookability'
import { calendarHref } from '@/lib/calendar-href'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { LEAD_STAGE_LABELS, opportunityTitle } from '@/lib/leads'
import { proposalDisplayRange, PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import { invoiceAmountDue, invoiceBalance, amountPaid } from '@/lib/invoices'
import { derivePaymentStatus, deriveAging } from '@/lib/invoice-status'
import type { DayDetail } from '@/actions/calendar'
import type { RunwayJob } from '@/lib/calendar-cashflow'
import type { CalendarItem } from '@/lib/calendar'
import type { Event, Lead, LeadStage, ProposalStatus, InvoicePaymentStatus } from '@/lib/types'
import type { VariantProps } from 'class-variance-authority'

// The live-swapping right pane. Deep-linkable at /calendar/[ymd]; on selection
// it re-renders on the server and streams in (App-Router master-detail, mirroring
// the Clients cockpit).
//
// ── COMPOSITION (screen-composition, run before the JSX) ─────────────────────
//
// THE JOB, in the operator's words: "I'm driving the cart to a job today — get
// me to the right place, put me in touch with whoever is meeting me there, tell
// me how many I'm pouring for, and don't let me forget who owes me money."
//
// THE DECIDING VALUE: on a job day the next physical act is *leave for the
// venue*, so the deciding pair is WHERE and WHO. They are the focal element of
// each job block: full-width, bordered, >=44px, directly under the job's name
// and hours. Money owed changes nothing about the next hour — it changes what
// you say when you arrive — so it is visible but quieter and lower.
//
// ORDER (by decision, not by schema):
//   1. Blocking      — a lapsed document can cancel the drive. Moved to the TOP
//                      from the bottom; it is still folded inline, not a rail.
//   2. Money due     — ONLY when the day holds no job. On a jobless day the
//                      invoice IS the day, and it used to render nowhere at all.
//   3. Jobs          — name + hours + headcount → WHERE → WHO → money/paperwork.
//   4. Drop pickups  — the other place to physically be; now maps-linked too.
//   5. Prep tasks    — today's desk work.
//   6. Money due     — last, when there IS a job to drive to.
//
// WHAT GOT QUIETER: the Job / Proposals / Invoices trio used to be three equal-
// weight bordered RelatedRecordCards stacked in a column inside a fourth card —
// the textbook uniform card stack, and it ranked money above the address the
// crew does not have. They are now ONE de-chromed "Paperwork" ledger (the same
// kit rows, pills and amount tones; border, shadow and two of the three headers
// deleted) sitting below a rule, under the runway line. Duplicated values went
// with it: the job row no longer restates the event date the spine header
// already shows, and the proposal row no longer restates the status its own
// pill carries.
//
// EVERY BOX JUSTIFIED: the job card's border separates job A's address from
// job B's when a day holds two. The maps and call borders ARE the 44px hit
// areas. Nothing else in the block is boxed.

type Tone = NonNullable<VariantProps<typeof pillVariants>['tone']>

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

/**
 * The fullest navigable place string we can build: venue AND street when both
 * exist ("Alder Barn, 4102 W State St"). A venue name alone still geocodes; a
 * street alone loses the venue. Same rule as `locationLine()` in
 * lib/calendar.ts, which builds the identical string for the ICS LOCATION line
 * and for `CalendarItem.location` — it is module-private there, so this is one
 * rule spelled twice rather than two rules.
 */
function placeLine(name?: string, address?: string): string | undefined {
  const parts = [name?.trim(), address?.trim()].filter((p): p is string => !!p)
  return parts.length ? parts.join(', ') : undefined
}

/**
 * An `https:` maps URL — deliberately NOT `geo:` or `maps://`.
 *
 * This pane is server-rendered with no platform signal available at render
 * time (UA-sniffing inside an RSC would fork the route's cache), so one href
 * has to work everywhere it might be tapped. `geo:0,0?q=…` is the RFC 5870
 * form Android resolves and iOS Safari does not; `maps://` is Apple-only;
 * both dead-link in the desktop browser where this admin is mostly open.
 * An https maps URL is claimed by the Google Maps app through app links on
 * both phones and otherwise falls back to a working web map with directions.
 * It never dead-links — the only property that matters to a driver standing
 * in a parking lot.
 */
function mapsHref(place: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(place)}`
}

/**
 * RFC 3966 wants a dial string with no spaces or punctuation. The guard in
 * front of it mirrors `validatePhone` in the Clients cockpit
 * (components/admin/clients/ClientWorkingRail.tsx): a value the operator
 * fat-fingered, or typed as prose ("ask Ben"), degrades to plain text instead
 * of becoming a link that dials nothing.
 */
const MIN_DIALABLE_DIGITS = 7
function telHref(phone: string | undefined | null): string | null {
  const raw = phone?.trim()
  if (!raw) return null
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < MIN_DIALABLE_DIGITS) return null
  return `tel:${raw.startsWith('+') ? '+' : ''}${digits}`
}

interface CrewContact {
  name: string
  role?: string
  /** null = a real, named contact we cannot dial. Never a fabricated number. */
  tel: string | null
}

/**
 * Who is actually meeting the crew on site.
 *
 * `Event.key_contacts` first — that IS the on-site list, and it already rides
 * along on the day's Event, so nothing had to be threaded through
 * getDayDetail. The linked opportunity's own `phone` is the fallback, because
 * a solo job's client often never gets promoted to a key contact. A key
 * contact with no usable number is still shown (a name is real data, and the
 * gap is fixable); a *lead* with no usable number is not, because the
 * Paperwork ledger already names the job.
 *
 * Dialable entries sort first so the tappable one lands under the thumb.
 */
function crewContacts(event: Event, job: Lead | null): CrewContact[] {
  const named = (event.key_contacts ?? [])
    .filter((c) => c.name?.trim())
    .map((c) => ({ name: c.name.trim(), role: c.role?.trim() || undefined, tel: telHref(c.phone) }))
  if (named.length > 0) {
    return named.slice().sort((a, b) => Number(b.tel != null) - Number(a.tel != null))
  }
  const leadName = job?.name?.trim()
  const leadTel = telHref(job?.phone)
  return leadName && leadTel ? [{ name: leadName, role: 'Client', tel: leadTel }] : []
}

/** Shared geometry for the two on-site tap targets: 44px minimum, one-handed,
 *  outdoors, in a van (WCAG 2.5.5 target size, and plain physical reality). */
const GO_TARGET =
  'flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-border px-2.5 py-1.5 ' +
  'transition-colors motion-reduce:transition-none'
const GO_LINK = `${GO_TARGET} bg-background hover:bg-muted focus-visible:bg-muted`

function NavigateLink({ place }: { place: string }) {
  return (
    <a
      href={mapsHref(place)}
      target="_blank"
      rel="noreferrer"
      // Says what it does AND where it goes — never a bare "Navigate". The
      // visible text is `place`, which the name contains (WCAG 2.5.3).
      aria-label={`Navigate to ${place}`}
      className={GO_LINK}
    >
      <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px] leading-tight font-medium text-foreground">{place}</span>
    </a>
  )
}

function CrewContactRow({ contact, settingsHref }: { contact: CrewContact; settingsHref: string }) {
  const label = contact.role ? `${contact.name}, ${contact.role}` : contact.name
  const body = (
    <span className="min-w-0 flex-1 leading-tight">
      <span className="block truncate text-[13px] font-medium text-foreground">{contact.name}</span>
      {contact.role ? <span className="block truncate text-xs text-muted-foreground">{contact.role}</span> : null}
    </span>
  )

  if (!contact.tel) {
    // A named on-site contact with no number is a two-tap gap, not a dead end:
    // the target goes to the settings tab that owns key contacts. No `tel:`
    // link is rendered, because there is nothing real to dial.
    return (
      <Link href={settingsHref} aria-label={`Add a phone number for ${label}`} className={cn(GO_LINK, 'border-dashed')}>
        <PhoneOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {body}
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">No number</span>
      </Link>
    )
  }

  return (
    <a href={contact.tel} aria-label={`Call ${label}`} className={GO_LINK}>
      <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {body}
    </a>
  )
}

interface DaySpineProps {
  orgSlug: string
  today: string
  /** getDayDetail() output for the shown day. */
  detail: DayDetail
  /** buildRunway() output — the per-event line uses the entry keyed by eventId. */
  runway?: RunwayJob[]
  /** The Bookability Verdict for this day. Absent for days behind today, and
   *  outside the cockpit shell — the banner then simply does not render. */
  bookability?: Bookability
}

/**
 * THE ANSWER TO "ARE YOU FREE THAT DAY?", stated in full.
 *
 * This is the n:1 surface. The month cell gets an 8px glyph because it has to
 * say the same thing forty-two times; here there is exactly ONE day, so the
 * verdict gets the sentence, the numbers it fired on, the link to the field
 * behind it and the dates to offer instead — everything the operator needs to
 * finish the phone call without opening anything else.
 *
 * It renders ABOVE the empty state, not inside the populated branch, on purpose.
 * "Nothing scheduled" over a day whose only cart is blocked out is precisely the
 * misreading this whole feature exists to remove: an empty day is not the same
 * claim as a free one.
 *
 * It never blocks. "Book a job" stays live underneath on a `closed` day — the
 * operator knows things the model does not (they can borrow a cart, they can
 * prep in four days if they have to). A verdict that vetoed the booking would
 * be wrong exactly when it mattered most.
 */
function BookabilityBanner({ orgSlug, bookability }: { orgSlug: string; bookability: Bookability }) {
  const { verdict, binding, alternatives } = bookability

  // Open: one quiet line, no panel, no green. The operator asked and got a
  // positive answer — Norman's feedback — but a free day is the default state
  // and the default state does not get a coloured box.
  if (verdict === 'open' || !binding) {
    return (
      <p data-slot="bookability-banner" data-verdict="open" className="px-4 pt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Open for booking</span> — nothing on file stands in
        the way of this day.
      </p>
    )
  }

  return (
    <section
      data-slot="bookability-banner"
      data-verdict={verdict}
      aria-label="Bookability"
      className={cn('mx-4 mt-3 rounded-lg px-3 py-2.5', verdictTone(verdict))}
    >
      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
        <BookabilityMark verdict={verdict} hideLabel />
        <span>{VERDICT_LABEL[verdict]} for booking</span>
      </p>
      {/* The binding constraint, named. One sentence, operator language. */}
      <p className="mt-1 text-xs leading-snug">{binding.reason}</p>
      {/* PROVENANCE. The exact values the rule fired on — so a verdict that
          looks wrong can be checked, not just disbelieved — and a link to the
          field that produced it, so it can be fixed at source rather than
          worked around. */}
      {/* NO opacity utility here, and that is deliberate. Walked in the browser
          and measured: `opacity-80` on this 10px line resolves to 3.43:1 in
          light mode (3.99:1 on the amber) against a 4.5:1 AA floor — a WCAG
          1.4.3 failure invisible to every test in the suite, because a class
          name tells you nothing about a contrast ratio. The hierarchy this
          line needs is already carried by size, case and family; dimming it
          was buying nothing and costing legibility.
          break-words: a 360px spine on a phone, and this is a long run of
          key=value pairs with no natural break points. */}
      <p className="mt-1.5 break-words font-mono text-[10px] uppercase tracking-wide">
        {binding.rule} ·{' '}
        {Object.entries(binding.inputs)
          .map(([k, v]) => `${k}=${v}`)
          .join(' · ')}
      </p>
      <Link
        href={binding.fixHref}
        className="mt-1.5 inline-flex min-h-6 items-center text-xs font-medium underline underline-offset-2 hover:no-underline"
      >
        Check the setting behind this
      </Link>
      {alternatives.length > 0 ? (
        <div className="mt-2 border-t border-current/15 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[.06em]">
            Next open {weekdayName(alternatives[0])}
          </p>
          {/* Offerable, not merely informational: each is a link straight to
              that day's spine, so "how about the 20th?" is one tap away. 24px
              tall (WCAG 2.5.8). */}
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {alternatives.map((alt) => (
              <li key={alt}>
                <Link
                  href={calendarHref({ orgSlug, ymd: alt })}
                  className="inline-flex min-h-6 items-center rounded-md border border-current/25 px-1.5 text-xs font-medium tabular-nums hover:bg-current/10"
                >
                  {shortDayLabel(alt)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
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

  // One ledger, three kinds. Ids are prefixed because a row key now spans
  // collections that mint their own ids.
  const jobRows: RelatedRow[] = job
    ? [
        {
          id: `job:${job.id}`,
          title: opportunityTitle(job),
          // NOT the event date: the spine header already names the day.
          subtitle: 'Job',
          badge: <StatusPill tone={JOB_TONE[job.stage]}>{LEAD_STAGE_LABELS[job.stage]}</StatusPill>,
          amount: job.estimated_value != null ? formatMoney(job.estimated_value) : undefined,
          href: `/${orgSlug}/leads/${job.id}`,
        },
      ]
    : []

  const proposalRows: RelatedRow[] = proposals.map((p) => {
    const { min, max } = proposalDisplayRange(p)
    return {
      id: `proposal:${p.id}`,
      title: p.title || 'Untitled proposal',
      // NOT the status: the pill beside it already carries that.
      subtitle: 'Proposal',
      badge: <StatusPill tone={PROPOSAL_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</StatusPill>,
      amount: min === max ? formatMoney(min) : `${formatMoney(min)}–${formatMoney(max)}`,
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
      id: `invoice:${inv.id}`,
      title: inv.number ? `Invoice ${inv.number}` : inv.title || 'Invoice',
      // Overdue is said in WORDS as well as in the red amount — colour is
      // never the only carrier (WCAG 1.4.1).
      subtitle: inv.due_date
        ? `Invoice · ${overdue ? 'overdue since' : 'due'} ${inv.due_date}`
        : 'Invoice',
      badge: <StatusPill tone={INVOICE_TONE[status]}>{INVOICE_STATUS_LABELS[status]}</StatusPill>,
      amount: formatMoney(balance),
      amountTone: overdue ? 'alert' : 'default',
      href: `/${orgSlug}/leads/${inv.lead_id}/invoices/${inv.id}`,
    }
  })

  const paperwork: RelatedRow[] = [...jobRows, ...proposalRows, ...invoiceRows]

  const time = event.hours ? `${event.hours.start} – ${event.hours.end}` : 'Time TBD'
  // Real field or nothing: Event.headcount, never a guess from the lead.
  const guests =
    event.headcount != null && event.headcount > 0
      ? `${event.headcount.toLocaleString()} ${event.headcount === 1 ? 'guest' : 'guests'}`
      : null
  const place = placeLine(event.location?.name, event.location?.address)
  const contacts = crewContacts(event, job)
  const showRunway = runwayJob != null && runwayJob.inflowBefore > 0

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="px-3 pt-3 pb-2.5">
        <Link
          href={`/${orgSlug}/${event.slug}/dashboard`}
          className="block text-sm leading-snug font-semibold text-foreground hover:underline"
        >
          {event.name}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{time}</span>
          {guests ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{guests}</span>
            </>
          ) : null}
        </p>
      </header>

      {/* WHERE + WHO — the focal pair. Everything below the rule is desk work. */}
      {place || contacts.length > 0 ? (
        <div className="space-y-1.5 px-3 pb-3">
          {place ? <NavigateLink place={place} /> : null}
          {contacts.map((c, i) => (
            <CrewContactRow
              key={`${c.name}:${i}`}
              contact={c}
              settingsHref={`/${orgSlug}/${event.slug}/settings`}
            />
          ))}
        </div>
      ) : null}

      {showRunway || paperwork.length > 0 ? (
        <div className={cn('space-y-2 px-3 py-2.5', showRunway && 'border-t border-border')}>
          {showRunway ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums text-[var(--money-green)]">
                {formatMoney(runwayJob.inflowBefore)}
              </span>{' '}
              expected to land before this job
            </p>
          ) : null}
          {paperwork.length > 0 ? (
            // The kit's row grammar, de-chromed: one hairline-ruled ledger in
            // place of three stacked cards. previewLimit is the row count so
            // the brick never renders its inert "View all →" line here.
            <RelatedRecordCard
              title="Paperwork"
              count={paperwork.length}
              rows={paperwork}
              previewLimit={paperwork.length}
              emptyTitle="No linked records"
              className="-mx-3 rounded-none border-0 bg-transparent shadow-none"
            />
          ) : null}
        </div>
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
          <li
            key={`${i.kind}:${i.id}`}
            className={cn(
              'flex items-stretch overflow-hidden rounded-md border border-border bg-card',
              tone === 'alert' && 'border-l-2 border-l-destructive'
            )}
          >
            <Link
              href={i.href}
              className="flex min-h-11 min-w-0 flex-1 flex-col justify-center px-2.5 py-2 transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none"
            >
              <span
                className={cn(
                  'block truncate text-[13px] font-medium',
                  tone === 'alert' ? 'text-destructive' : 'text-foreground'
                )}
              >
                {i.title}
              </span>
              {i.detail ? <span className="block truncate text-xs text-muted-foreground">{i.detail}</span> : null}
            </Link>
            {/* A drop pickup is a place you drive to. The feed already carries
                its LOCATION line for the ICS export, so the same string buys a
                44x44 navigate target here. Rendered as a SIBLING of the row
                link — an <a> may not contain another <a>. */}
            {i.location ? (
              <a
                href={mapsHref(i.location)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Navigate to ${i.location}`}
                className="flex min-h-11 w-11 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none"
              >
                <MapPin className="size-4" aria-hidden />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Invoices FALLING DUE on the shown day.
 *
 * These are the `invoice_due` items the week and month cells already render as
 * a money chip. The spine did not render them and its empty check ignored
 * them, so a day carrying a $4,200 balance and no booked event read "Nothing
 * scheduled" while its own grid cell showed the money — two surfaces built
 * from one feed disagreeing. Distinct from a job's Paperwork ledger, which
 * lists every invoice linked to that job whatever its due date.
 */
function MoneyDueList({ items }: { items: CalendarItem[] }) {
  if (items.length === 0) return null
  const total = items.reduce((sum, i) => sum + (i.amount ?? 0), 0)
  return (
    <section aria-label="Invoices due this day">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">Money due</h3>
        {/* Only when there is more than one — a single balance is already on
            its own row, and restating it would be the same number twice. */}
        {items.length > 1 && total > 0 ? (
          <span className="text-[11px] font-semibold tabular-nums text-[var(--money-green)]">
            {formatMoney(total)} total
          </span>
        ) : null}
      </div>
      <ul role="list" className="space-y-1">
        {items.map((i) => (
          <li key={`${i.kind}:${i.id}`}>
            <Link
              href={i.href}
              className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none"
            >
              {/* colour + shape + an sr-only kind name, same mark the grids use */}
              <KindDot kind={i.kind} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">{i.title}</span>
                {i.detail ? <span className="block truncate text-xs text-muted-foreground">{i.detail}</span> : null}
              </span>
              {i.amount != null ? (
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--money-green)]">
                  {formatMoney(i.amount)}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function DaySpine({ orgSlug, today, detail, runway = [], bookability }: DaySpineProps) {
  const now = new Date()
  const runwayByEvent = new Map(runway.map((r) => [r.eventId, r]))
  const isToday = detail.ymd === today
  const hasJobs = detail.events.length > 0
  const isEmpty =
    !hasJobs &&
    detail.tasks.length === 0 &&
    detail.blockers.length === 0 &&
    detail.drops.length === 0 &&
    // The day's own money counts as something scheduled. Leaving it out here
    // is what produced "Nothing scheduled" over a $4,200 balance.
    detail.invoicesDue.length === 0

  const moneyDue = <MoneyDueList items={detail.invoicesDue} />

  return (
    <aside aria-label="Day detail" className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-background">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{fullDayLabel(detail.ymd)}</h2>
        {isToday ? (
          <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">today</span>
        ) : null}
      </header>

      {/* ABOVE the empty/populated fork, because the verdict is a property of
          the DATE, not of what happens to be on it. This is the one placement
          decision the whole feature turns on: an empty day that reads only
          "Nothing scheduled" is exactly the answer the operator could not
          trust. */}
      {bookability ? <BookabilityBanner orgSlug={orgSlug} bookability={bookability} /> : null}

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
          {/* Stop-work first: a lapsed document can cancel the drive. Still
              folded into the spine (decision #3) — never a separate rail. */}
          <SpineList label="Blocking" items={detail.blockers} tone="alert" />

          {/* On a day with no job, the money IS the day. */}
          {!hasJobs ? moneyDue : null}

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

          <SpineList label="Drop pickups" items={detail.drops} />
          <SpineList label="Prep tasks" items={detail.tasks} />

          {/* …and the money last, when there is a job to drive to. */}
          {hasJobs ? moneyDue : null}
        </div>
      )}
    </aside>
  )
}
