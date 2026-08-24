'use client'

// Job: standing at the van with one hand free — where am I going, when does it
// start, who do I call, and what's left to check off, without assembling
// anything from three tabs.
//
// Deciding value: THE anchor time. It is the one number the whole morning
// back-plans from, so it is the biggest thing on the sheet, it names its own
// source (B7 — "Service" / "Starts" / "First item", never a fabricated time),
// and the Pack-by / Leave-by chips are derived from it under a visible
// assumption label. Everything else renders in execution order below it.
//
// All data arrives inlined from the server page: an open tab keeps answering
// in a dead zone. Check-offs are optimistic with VISIBLE pending/failed state
// — never a silent revert — and the freshness stamp says how old the sheet is.

import { useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Check, CheckCircle2, MapPin, Mail, MessageSquare, Phone, Printer, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { completeChecklistStep, confirmReady, sendRunSheet } from '@/actions/event-ops'
import { formatTime, type ItineraryDay } from '@/lib/itinerary'
import type { EventKeyContact, EventLocation, OpsChecklist } from '@/lib/types'
import {
  backPlanFromAnchor,
  bufferAssumptionLabel,
  mapsSearchUrl,
  TIMELINE_FOLD,
  type AnchorTime,
  type OpsBuffers,
} from '@/app/(admin)/[orgSlug]/[eventSlug]/ops/runsheet/anchor'

export interface RunSheetClientProps {
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  eventName: string
  dateLabel: string
  anchor: AnchorTime | null
  isAdmin: boolean
  venue: EventLocation | null
  contacts: EventKeyContact[]
  hasPlan: boolean
  siteNeeds: string[]
  itinerary: ItineraryDay[]
  /** Day-of phases only (setup, service-close), pre-filtered server-side. */
  checklists: OpsChecklist[]
  /** Combined shopping + packing progress; null = no plan. */
  loadout: { checked: number; total: number } | null
  /** Standing "ready" attestation from the plan doc (inc-2 P2); null = none. */
  readyConfirmed: { at: string; by: string } | null
  /** Display name behind readyConfirmed.by, resolved server-side; null = unresolved. */
  confirmedByName: string | null
  /** Org back-plan buffers; absent fields fall back to the constants. */
  buffers?: OpsBuffers
}

const ANCHOR_SOURCE_HINT: Record<AnchorTime['label'], string> = {
  Service: 'from the ops plan',
  Starts: 'booked time',
  'First item': 'from the schedule',
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
}

const emptySubscribe = () => () => {}

/** Weekday-first day heading for multi-day timelines, e.g. "Fri, Aug 28". */
function dayHeading(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return day
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Viewer-local confirm stamp: '9:14 PM' same-day, 'Fri 9:14 PM' otherwise —
 *  the evening-before ritual read the next morning still shows its true day.
 *  One deliberate story for this stamp (see lib/event-spine.formatConfirmStamp):
 *  client-rendered stamps like this one are viewer-local (honest — they format
 *  in the viewer's browser); the brief's SERVER-rendered stamp is explicit
 *  UTC-labeled instead. The label there is what keeps the two surfaces honest
 *  when their clock faces differ. */
function confirmStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay ? time : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`
}

export function RunSheetClient(props: RunSheetClientProps) {
  const { orgId, eventId, orgSlug, eventSlug } = props
  const base = `/${orgSlug}/${eventSlug}`

  const [checklists, setChecklists] = useState(props.checklists)
  // `${checklistId}:${stepIndex}` → in-flight / failed (value = the desired
  // `done` so Retry replays exactly what the tap meant).
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set())
  const [failedKeys, setFailedKeys] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [showAllTimeline, setShowAllTimeline] = useState(false)

  // Confirm-ready (inc-2 P2). NOT optimistic on purpose: flipping to
  // "Confirmed" before the server accepted would forge an attestation — the
  // button shows a visible pending state, then the stamp or a visible failure
  // with Retry (never a silent revert).
  const [confirmed, setConfirmed] = useState(props.readyConfirmed)
  const [confirming, setConfirming] = useState(false)
  const [confirmFailed, setConfirmFailed] = useState(false)
  const confirmedJustNow = confirmed !== null && confirmed !== props.readyConfirmed

  // Send-run-sheet (self-send v1): pending → sent-to-address / visible failure.
  const [sendState, setSendState] = useState<
    { status: 'idle' | 'sending' | 'failed' } | { status: 'sent'; to: string }
  >({ status: 'idle' })

  async function handleConfirm() {
    setConfirming(true)
    setConfirmFailed(false)
    try {
      setConfirmed(await confirmReady(props.orgId, props.eventId))
    } catch {
      setConfirmFailed(true)
    } finally {
      setConfirming(false)
    }
  }

  async function handleSend() {
    setSendState({ status: 'sending' })
    try {
      const { to } = await sendRunSheet(props.orgId, props.eventId)
      setSendState({ status: 'sent', to })
    } catch {
      setSendState({ status: 'failed' })
    }
  }

  // Freshness stamp (Nielsen 1): stamped once, client-side, in the VIEWER'S
  // timezone — not the server's render time. useSyncExternalStore with a null
  // server snapshot is the hydration-safe way to render a client-only value
  // (no setState-in-effect, no mismatch warning).
  const stampRef = useRef<string | null>(null)
  const loadedAt = useSyncExternalStore(
    emptySubscribe,
    () => (stampRef.current ??= new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })),
    () => null
  )

  function patchStep(checklistId: string, stepIndex: number, done: boolean) {
    setChecklists((prev) =>
      prev.map((c) =>
        c.id !== checklistId
          ? c
          : { ...c, steps: c.steps.map((s, i) => (i === stepIndex ? { ...s, done } : s)) }
      )
    )
  }

  async function toggleStep(checklistId: string, stepIndex: number, done: boolean) {
    const key = `${checklistId}:${stepIndex}`
    patchStep(checklistId, stepIndex, done)
    setPendingKeys((prev) => new Set(prev).add(key))
    setFailedKeys((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    try {
      await completeChecklistStep(orgId, eventId, checklistId, stepIndex, { done })
    } catch {
      // Revert AND say so — a custody-of-truth surface never reverts silently.
      patchStep(checklistId, stepIndex, !done)
      setFailedKeys((prev) => new Map(prev).set(key, done))
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const backPlan = props.anchor ? backPlanFromAnchor(props.anchor.hhmm, props.buffers) : null
  const bufferLabel = bufferAssumptionLabel(props.buffers)

  // Attestation microcopy (P2): the confirm button names the facts on screen
  // that the tap attests to — live checklist state, load count, the anchor and
  // the buffer assumption — so what was confirmed is on the record.
  const attestSteps = checklists.flatMap((c) => c.steps)
  const attestStepsDone = attestSteps.filter((s) => s.done).length
  const attestation = [
    ...(props.loadout && props.loadout.total > 0 ? [`Load ${props.loadout.checked}/${props.loadout.total}`] : []),
    ...(attestSteps.length > 0
      ? [attestStepsDone === attestSteps.length ? 'checklists done' : `checklists ${attestStepsDone}/${attestSteps.length}`]
      : []),
    props.anchor ? `anchored ${props.anchor.display}` : 'no anchor time',
    bufferLabel,
  ].join(' · ')

  const totalEntries = props.itinerary.reduce((n, d) => n + d.items.length, 0)
  let visibleItinerary = props.itinerary
  if (!showAllTimeline && totalEntries > TIMELINE_FOLD) {
    let remaining = TIMELINE_FOLD
    visibleItinerary = []
    for (const day of props.itinerary) {
      if (remaining <= 0) break
      visibleItinerary.push({ day: day.day, items: day.items.slice(0, remaining) })
      remaining -= day.items.length
    }
  }
  const multiDay = props.itinerary.length > 1

  const contactable = props.contacts

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-5">
      {/* ── Top band: identity · anchor · venue · contacts — everything a call
             sheet keeps above the fold. Single column at every width. ── */}
      <header>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{props.eventName}</span> · {props.dateLabel}
        </p>

        {props.anchor ? (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-muted-foreground">{props.anchor.label}</span>
            <span className="text-4xl font-bold tracking-tight tabular-nums">{props.anchor.display}</span>
            <span className="text-xs text-muted-foreground">{ANCHOR_SOURCE_HINT[props.anchor.label]}</span>
          </p>
        ) : (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="text-4xl font-bold tracking-tight text-muted-foreground">Time TBD</span>
            {props.isAdmin && (
              <Link href={`${base}/settings`} className="text-sm font-medium text-[var(--link)] underline underline-offset-2">
                Set time
              </Link>
            )}
          </p>
        )}

        {backPlan && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">Pack by {backPlan.packBy}</span>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">Leave by {backPlan.leaveBy}</span>
            <span className="text-xs text-muted-foreground">{bufferLabel}</span>
          </div>
        )}

        <div className="mt-3">
          {props.venue ? (
            <a
              href={mapsSearchUrl(props.venue.address ?? props.venue.name)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted"
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 text-sm">
                <span className="font-medium">{props.venue.name}</span>
                {props.venue.address && <span className="text-muted-foreground"> · {props.venue.address}</span>}
              </span>
              <span className="ml-auto shrink-0 text-xs font-medium text-[var(--link)]">Maps</span>
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              No venue on file
              {props.isAdmin && (
                <>
                  {' · '}
                  <Link href={`${base}/settings`} className="font-medium text-[var(--link)] underline underline-offset-2">
                    Add venue
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        {/* Contacts stay in the top band — call-sheet rule: people you might
            need to call never live below the fold. */}
        <div className="mt-3 space-y-1">
          {contactable.length > 0 ? (
            contactable.map((c, i) => (
              <div key={i} className="flex min-h-11 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">{c.name}</span>
                  {c.role && <span className="text-muted-foreground"> · {c.role}</span>}
                </span>
                {c.phone && (
                  <>
                    <Button
                      variant="outline"
                      size="icon-touch"
                      nativeButton={false}
                      aria-label={`Call ${c.name}`}
                      render={<a href={`tel:${c.phone}`} />}
                    >
                      <Phone />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-touch"
                      nativeButton={false}
                      aria-label={`Text ${c.name}`}
                      render={<a href={`sms:${c.phone}`} />}
                    >
                      <MessageSquare />
                    </Button>
                  </>
                )}
                {c.email && (
                  <Button
                    variant="outline"
                    size="icon-touch"
                    nativeButton={false}
                    aria-label={`Email ${c.name}`}
                    render={<a href={`mailto:${c.email}`} />}
                  >
                    <Mail />
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {/* Adding a contact edits event settings, and updateEvent asserts
                  org admin — same isAdmin gate as Set time / Add venue, so a
                  non-admin never types into a form whose save must fail. */}
              No contacts on file
              {props.isAdmin && (
                <>
                  {' · '}
                  <Link href={`${base}/settings`} className="font-medium text-[var(--link)] underline underline-offset-2">
                    + Add contact
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Loaded {loadedAt ?? '…'}</span>
          {pendingKeys.size > 0 && <span>· {pendingKeys.size} saving…</span>}
          {failedKeys.size > 0 && (
            <span className="font-medium text-destructive">
              · {failedKeys.size} check-off{failedKeys.size === 1 ? '' : 's'} failed
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            className="ml-auto"
            render={<Link href={`${base}/ops/runsheet/print`} />}
          >
            <Printer data-icon="inline-start" /> Print
          </Button>
        </div>

        {/* ── Confirm-ready (inc-2 P2) + self-send — by the freshness stamp ── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {props.hasPlan &&
            (confirmed ? (
              <p className="flex min-h-11 items-center gap-1.5 text-sm">
                <CheckCircle2 aria-hidden className="size-4 shrink-0 text-[var(--status-confirmed-fg)]" />
                <span className="font-medium text-[var(--status-confirmed-fg)]">Confirmed ready</span>
                <span className="text-muted-foreground" suppressHydrationWarning>
                  · {confirmStamp(confirmed.at)}
                  {confirmedJustNow ? ' · by you' : props.confirmedByName ? ` · by ${props.confirmedByName}` : ''}
                </span>
              </p>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button size="touch" onClick={handleConfirm} disabled={confirming}>
                  {confirming ? 'Confirming…' : 'Confirm ready'}
                </Button>
                {/* Attestation record: the facts this tap signs off on. */}
                <span className="max-w-xs text-xs text-muted-foreground">{attestation}</span>
              </span>
            ))}
          <Button variant="outline" size="touch" onClick={handleSend} disabled={sendState.status === 'sending'}>
            <Send data-icon="inline-start" /> {sendState.status === 'sending' ? 'Sending…' : 'Email me this sheet'}
          </Button>
          {sendState.status === 'sent' && (
            <span className="text-xs text-muted-foreground">Sent to {sendState.to}</span>
          )}
        </div>
        {confirmFailed && (
          <p className="mt-1 flex items-center gap-2 text-sm text-destructive" role="alert">
            Couldn&rsquo;t save the confirmation
            <Button variant="outline" size="touch" onClick={handleConfirm}>
              Retry
            </Button>
          </p>
        )}
        {sendState.status === 'failed' && (
          <p className="mt-1 flex items-center gap-2 text-sm text-destructive" role="alert">
            Couldn&rsquo;t send the sheet
            <Button variant="outline" size="touch" onClick={handleSend}>
              Retry
            </Button>
          </p>
        )}
      </header>

      {props.hasPlan ? (
        <>
          {/* ── Site needs ── */}
          <section className="mt-5 border-t border-border pt-4">
            <Kicker>Site needs</Kicker>
            {props.siteNeeds.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {props.siteNeeds.map((need) => (
                  <span key={need} className="rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium capitalize">
                    {need}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                None recorded{' · '}
                <Link href={`${base}/ops`} className="font-medium text-[var(--link)] underline underline-offset-2">
                  Add site needs
                </Link>
              </p>
            )}
          </section>
        </>
      ) : (
        // One consolidated empty for the three plan-derived sections — three
        // stacked "no plan" empties would say the same thing three times.
        <section className="mt-5 border-t border-border pt-4">
          <EmptyState
            title="No ops plan yet"
            description="Site needs, day-of checklists and the load list all come from the plan."
            action={
              <Button size="touch" nativeButton={false} render={<Link href={`${base}/ops`} />}>
                Set up ops plan
              </Button>
            }
          />
        </section>
      )}

      {/* ── Timeline ── */}
      <section className="mt-5 border-t border-border pt-4">
        <Kicker>Timeline</Kicker>
        {totalEntries > 0 ? (
          <div className="mt-2 space-y-4">
            {visibleItinerary.map((day) => (
              <div key={day.day}>
                {multiDay && <h3 className="mb-1 text-sm font-semibold">{dayHeading(day.day)}</h3>}
                <ol className="space-y-0.5">
                  {day.items.map((item) => (
                    <li key={item.id} className="flex gap-3 py-1.5">
                      <span className="w-20 shrink-0 text-sm font-medium tabular-nums">
                        {formatTime(item.start_time)}
                      </span>
                      <span className="min-w-0 text-sm">
                        <span className="font-medium">{item.title}</span>
                        {item.location && <span className="text-muted-foreground"> · {item.location}</span>}
                        {item.description && (
                          <span className="block text-xs text-muted-foreground">{item.description}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {!showAllTimeline && totalEntries > TIMELINE_FOLD && (
              <Button variant="outline" size="touch" className="w-full" onClick={() => setShowAllTimeline(true)}>
                Show all {totalEntries}
              </Button>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {/* /itinerary needs the 'itinerary' page grant, which an ops-granted
                member may lack — requireEventPage would bounce them to the org
                home. isAdmin always passes canAccessEventPage, so gate like Set
                time / Add venue rather than dead-end a restricted member. */}
            No schedule yet
            {props.isAdmin && (
              <>
                {' · '}
                <Link href={`${base}/itinerary`} className="font-medium text-[var(--link)] underline underline-offset-2">
                  + Add schedule
                </Link>
              </>
            )}
          </p>
        )}
      </section>

      {/* ── Day-of checklists: setup, then service & close ── */}
      {props.hasPlan && (
        <section className="mt-5 border-t border-border pt-4">
          <Kicker>Checklists</Kicker>
          {checklists.length > 0 ? (
            <div className="mt-2 space-y-4">
              {checklists.map((c) => {
                const doneCount = c.steps.filter((s) => s.done).length
                return (
                  <div key={c.id}>
                    <h3 className="flex items-baseline justify-between text-sm font-semibold">
                      {c.name}
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {doneCount}/{c.steps.length}
                      </span>
                    </h3>
                    <div className="mt-1">
                      {c.steps.map((s, i) => {
                        const key = `${c.id}:${i}`
                        const pending = pendingKeys.has(key)
                        const failedDone = failedKeys.get(key)
                        // Evidence steps (photo/number) need capture UI that
                        // lives on the ops plan — the run sheet links instead
                        // of half-implementing it.
                        const interactive = s.evidence === 'none'
                        return (
                          <div key={i}>
                            {interactive ? (
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={s.done}
                                disabled={pending}
                                onClick={() => toggleStep(c.id, i, !s.done)}
                                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-muted active:bg-muted disabled:opacity-70"
                              >
                                <span
                                  aria-hidden
                                  className={`grid size-6 shrink-0 place-items-center rounded-md border ${
                                    s.done
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-input'
                                  }`}
                                >
                                  {s.done && <Check className="size-4" />}
                                </span>
                                <span className={`text-sm ${s.done ? 'text-muted-foreground line-through' : ''}`}>
                                  {s.text}
                                </span>
                                {pending && <span className="ml-auto shrink-0 text-xs text-muted-foreground">Saving…</span>}
                              </button>
                            ) : (
                              <div className="flex min-h-11 w-full items-center gap-3 px-2">
                                <span
                                  aria-hidden
                                  className={`grid size-6 shrink-0 place-items-center rounded-md border ${
                                    s.done
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-input'
                                  }`}
                                >
                                  {s.done && <Check className="size-4" />}
                                </span>
                                <span className={`text-sm ${s.done ? 'text-muted-foreground line-through' : ''}`}>
                                  {s.text}
                                </span>
                                {!s.done && (
                                  <Link
                                    href={`${base}/ops`}
                                    className="ml-auto shrink-0 text-xs font-medium text-[var(--link)] underline underline-offset-2"
                                  >
                                    needs {s.evidence} · Ops
                                  </Link>
                                )}
                              </div>
                            )}
                            {failedDone !== undefined && (
                              <div className="flex items-center gap-2 pl-11 text-sm text-destructive" role="alert">
                                <span>Couldn&rsquo;t save</span>
                                {/* Day-of hard gate: retrying a failed check-off is a one-handed
                                    field action — 44px, matching LoadoutClient's retry rows. */}
                                <Button variant="outline" size="touch" onClick={() => toggleStep(c.id, i, failedDone)}>
                                  Retry
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No setup or service checklists on this plan{' · '}
              <Link href={`${base}/ops`} className="font-medium text-[var(--link)] underline underline-offset-2">
                Manage in Ops
              </Link>
            </p>
          )}
        </section>
      )}

      {/* ── Load-out status: the compute→execute bridge; the surface itself is /ops/loadout ── */}
      {props.hasPlan && props.loadout && (
        <section className="mt-5 border-t border-border pt-4">
          <Kicker>Load-out</Kicker>
          {props.loadout.total > 0 ? (
            <Link
              href={`${base}/ops/loadout`}
              className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted"
            >
              <span className="text-sm">
                <span className="font-semibold tabular-nums">
                  {props.loadout.checked} of {props.loadout.total}
                </span>{' '}
                packed
                {props.loadout.checked === props.loadout.total && (
                  <span className="text-muted-foreground"> — all set</span>
                )}
              </span>
              <span className="shrink-0 text-xs font-medium text-[var(--link)]">Open load-out</span>
            </Link>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No load list yet{' · '}
              <Link href={`${base}/ops`} className="font-medium text-[var(--link)] underline underline-offset-2">
                Pick packages in Ops
              </Link>
            </p>
          )}
        </section>
      )}
    </div>
  )
}
