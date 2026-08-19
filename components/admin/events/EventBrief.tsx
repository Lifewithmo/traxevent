// The dashboard's computed brief (S1) — the EmptyState stub dies here.
//
// JOB (operator's words): "Am I ready for THIS job and what's my next move?"
// DECIDING VALUE: the readiness VERDICT — the one focal element on the screen.
// DECISION ORDER (top to bottom, call-sheet canon — fixed hierarchy):
//   1. Job strip — when/where I show up: T-minus · day · honest time (B7
//      source-labeled) · venue→maps, with contact tel:/mailto affordances
//      folded into the strip (B1: not a block) and back-planned Pack-by /
//      Leave-by chips labeled as assumptions.
//   2. Verdict + concrete blockers — the judgment line, then what stands in
//      the way, each row a deep-link naming the actual item (B9).
//   3. NBA — the top blocker PROMOTED to THE single primary button (B9); the
//      promoted blocker never re-renders as a row (no value twice).
//   4. Money (owner/admin ONLY — the section is absent otherwise, B4).
// ≤7 first-screen items; no card stack — whitespace and one hairline rule
// group the zones. Server-renderable: all judgment math is pure lib code.
//
// Layout: single reading column (max-w-3xl) — this is an n:1 decision surface,
// not a data grid; rows wrap via flex-wrap and the column collapses gracefully
// at 375px (chips and strip facts wrap onto new lines; no fixed grids).
import Link from 'next/link'
import { ChevronRight, Mail, MapPin, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { eventCountdown, formatEventDate } from '@/lib/event-ui'
import {
  backPlanChips,
  blockerTarget,
  computeEventNba,
  computeEventVerdict,
  eventPhaseOf,
  formatJobDay,
  resolveJobTime,
  type EventNbaTarget,
  type EventSpineKpis,
  type EventVerdict,
} from '@/lib/event-spine'
import { cn, formatMoney } from '@/lib/utils'
import type { Event } from '@/lib/types'

interface EventBriefProps {
  orgSlug: string
  eventSlug: string
  event: Event
  kpis: EventSpineKpis
  /** Today's YYYY-MM-DD, computed server-side (deterministic countdown). */
  today: string
  /** owner/admin — gates the money section (B4) and the settings affordances. */
  isAdmin: boolean
}

const VERDICT_TONE: Record<EventVerdict['tone'], string> = {
  ok: 'text-[var(--status-confirmed-fg)]',
  pending: 'text-foreground',
  alert: 'text-destructive',
}

export function EventBrief({ orgSlug, eventSlug, event, kpis, today, isAdmin }: EventBriefProps) {
  const countdown = eventCountdown(event.event_start, event.event_end, today)
  const phase = eventPhaseOf(countdown.value)
  const verdict = computeEventVerdict({ phase, ops: kpis.ops, readiness: kpis.readiness, closeout: kpis.closeout, blockers: kpis.blockers })
  const nba = computeEventNba({ phase, ops: kpis.ops, closeout: kpis.closeout, blockers: kpis.blockers })
  // B9: the promoted blocker lives in the button — only the rest render as rows.
  const blockerRows = nba?.fromTopBlocker ? kpis.blockers.slice(1) : kpis.blockers

  const time = resolveJobTime({
    serviceStart: kpis.ops?.serviceStart,
    hoursStart: event.hours?.start,
    firstItineraryTime: kpis.firstItineraryTime,
  })
  const chips = time && phase !== 'wrapped' ? backPlanChips(time.hhmm) : null
  const contacts = (event.key_contacts ?? []).filter((c) => c.phone || c.email).slice(0, 3)
  const settingsHref = `/${orgSlug}/${eventSlug}/settings`
  const day = formatJobDay(event.event_start)
  const tMinus = /^\d+d$/.test(countdown.value) ? `T-${countdown.value}` : countdown.value

  const hrefFor = (target: EventNbaTarget) =>
    target === 'lead-invoices'
      ? // Money lives on the opportunity page (invoices panel); a manual event
        // without a lead settles its balance at closeout instead.
        event.lead_id ? `/${orgSlug}/leads/${event.lead_id}` : `/${orgSlug}/${eventSlug}/ops/closeout`
      : `/${orgSlug}/${eventSlug}/${target}`

  return (
    <div className="p-5">
      <div className="max-w-3xl">
        {/* ── 1 · Job strip: when/where I show up ─────────────────────────── */}
        <section aria-label="Job">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <span className="text-base font-semibold tabular-nums">{tMinus}</span>
            {day && (
              <>
                <Sep />
                <span className="font-medium">{day}</span>
              </>
            )}
            <Sep />
            {time ? (
              <span>{time.label}</span>
            ) : (
              <span className="text-muted-foreground">
                Time TBD
                {isAdmin && (
                  <>
                    {' '}
                    <Link href={settingsHref} className="font-medium text-primary hover:underline">
                      Set time
                    </Link>
                  </>
                )}
              </span>
            )}
            {event.location?.name ? (
              <>
                <Sep />
                <span>{event.location.name}</span>
              </>
            ) : (
              isAdmin && (
                <>
                  <Sep />
                  <Link href={settingsHref} className="font-medium text-primary hover:underline">
                    + Add venue
                  </Link>
                </>
              )
            )}
          </p>

          {/* Action affordances fold into the strip (B1) — 44px targets: these
              ARE day-of actions (navigate, call, email). Rendered only when the
              underlying fact exists; n=0 contacts → the admin add-affordance. */}
          {(event.location?.address || contacts.length > 0 || isAdmin) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {event.location?.address && (
                <Button
                  variant="outline"
                  size="touch"
                  nativeButton={false}
                  render={
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(event.location.address)}`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  <MapPin /> Map
                </Button>
              )}
              {contacts.map((c) => (
                <span key={`${c.name}-${c.role}`} className="inline-flex items-center gap-1.5">
                  {c.phone && (
                    <Button
                      variant="outline"
                      size="touch"
                      nativeButton={false}
                      render={<a href={`tel:${c.phone}`} aria-label={`Call ${c.name}`} />}
                    >
                      <Phone /> {c.name.split(' ')[0]}
                    </Button>
                  )}
                  {c.email && (
                    <Button
                      variant="outline"
                      size={c.phone ? 'icon-touch' : 'touch'}
                      nativeButton={false}
                      render={<a href={`mailto:${c.email}`} aria-label={`Email ${c.name}`} />}
                    >
                      <Mail />
                      {!c.phone && ` ${c.name.split(' ')[0]}`}
                    </Button>
                  )}
                </span>
              ))}
              {contacts.length === 0 && isAdmin && (
                <Link href={settingsHref} className="text-sm font-medium text-primary hover:underline">
                  + Add contact
                </Link>
              )}
            </div>
          )}

          {/* Back-planned chips (accepted ratchet): only when a real time source
              exists, always labeled as an assumption. */}
          {chips && (
            <p className="mt-2 text-sm">
              <span className="font-medium">Pack by {chips.packBy}</span>
              <Sep pad />
              <span className="font-medium">Leave by {chips.leaveBy}</span>
              <span className="ml-2 text-xs text-muted-foreground">assumes 45m pack · 30m drive</span>
            </p>
          )}
        </section>

        {/* ── 2+3 · Verdict, blockers, and THE next action ────────────────── */}
        {(verdict || blockerRows.length > 0 || nba) && (
          <section className="mt-6" aria-label="Readiness">
            <h2 className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
              {verdict ? 'Readiness' : 'Needs attention'}
            </h2>
            {verdict && (
              <p className={cn('mt-1 text-3xl font-semibold tracking-[-.02em]', VERDICT_TONE[verdict.tone])}>
                {verdict.label}
              </p>
            )}
            {/* Interpretation for the verdict — prep progress, not a bare %. */}
            {verdict && kpis.readiness && phase !== 'wrapped' && kpis.ops?.hasPlan && (
              <p className="mt-1 text-sm text-muted-foreground">
                {kpis.readiness.done} of {kpis.readiness.total} prep items done
              </p>
            )}

            {blockerRows.length > 0 && (
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {blockerRows.map((b) => (
                  <li key={b.kind}>
                    <Link href={hrefFor(blockerTarget(b.kind))} className="group flex min-h-11 items-center gap-2.5 py-2">
                      <span
                        aria-hidden
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          b.severity === 'alert' ? 'bg-destructive' : 'bg-muted-foreground/50'
                        )}
                      />
                      <span className="text-sm font-medium group-hover:underline">{b.label}</span>
                      {b.detail && <span className="text-xs text-muted-foreground">{b.detail}</span>}
                      <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {nba && (
              <div className="mt-4">
                <Button size="touch" nativeButton={false} render={<Link href={hrefFor(nba.target)} />}>
                  {nba.label}
                  <ChevronRight />
                </Button>
              </div>
            )}
          </section>
        )}

        {/* ── 4 · Money (owner/admin ONLY — absent otherwise, B4) ─────────── */}
        {isAdmin && (kpis.financial || kpis.ar) && (
          <section className="mt-6 border-t border-border pt-4" aria-label="Money">
            <h2 className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">Money</h2>
            {kpis.financial ? (
              <MoneyLine
                outstanding={kpis.financial.outstanding}
                billed={kpis.financial.totalDue}
                emptyLabel="Nothing billed yet"
              />
            ) : kpis.ar ? (
              <MoneyLine
                outstanding={kpis.ar.outstanding}
                billed={kpis.ar.invoiced}
                nextDue={kpis.ar.nextDueDate}
                // 'Deposit unpaid' is a blocker row/NBA — only the settled state
                // renders here, so no fact appears twice.
                depositPaid={kpis.ar.deposit === 'paid'}
                emptyLabel="Nothing invoiced yet"
                emptyAction={
                  event.lead_id ? { label: 'Open invoices', href: `/${orgSlug}/leads/${event.lead_id}` } : undefined
                }
              />
            ) : null}
          </section>
        )}
      </div>
    </div>
  )
}

function Sep({ pad = false }: { pad?: boolean }) {
  return <span className={cn('text-muted-foreground/60', pad && 'mx-2')}>·</span>
}

function MoneyLine({
  outstanding,
  billed,
  nextDue,
  depositPaid = false,
  emptyLabel,
  emptyAction,
}: {
  outstanding: number
  billed: number
  nextDue?: string
  depositPaid?: boolean
  emptyLabel: string
  emptyAction?: { label: string; href: string }
}) {
  if (billed <= 0) {
    return (
      <p className="mt-1 text-sm text-muted-foreground">
        {emptyLabel}
        {emptyAction && (
          <>
            {' · '}
            <Link href={emptyAction.href} className="font-medium text-primary hover:underline">
              {emptyAction.label}
            </Link>
          </>
        )}
      </p>
    )
  }
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {outstanding > 0 ? (
        <>
          <span className="text-2xl font-semibold tabular-nums text-[var(--money-green)]">{formatMoney(outstanding)}</span>
          <span className="text-sm text-muted-foreground">
            due · of {formatMoney(billed)} billed
            {nextDue ? ` · next due ${formatEventDate(nextDue)}` : ''}
          </span>
        </>
      ) : (
        <>
          <StatusPill tone="confirmed">Paid in full</StatusPill>
          <span className="text-sm text-muted-foreground">{formatMoney(billed)} billed</span>
        </>
      )}
      {depositPaid && <StatusPill tone="confirmed">Deposit paid</StatusPill>}
    </div>
  )
}
