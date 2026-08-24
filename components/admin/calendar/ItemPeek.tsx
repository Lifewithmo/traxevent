'use client'

import Link from 'next/link'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { calendarHref } from '@/lib/calendar-href'
import { formatLongDate, relativeDayLabel } from '@/lib/date-phrase'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { CALENDAR_KIND_LABELS, type CalendarItem, type CalendarKind } from '@/lib/calendar'
import { KindDot } from '@/components/admin/calendar/KindDot'
import { canReschedule } from '@/components/admin/calendar/reschedule-drag'
import { useTopDismissLayer } from '@/components/admin/calendar/dismiss-stack'

/**
 * PEEK — look at one calendar item WITHOUT leaving the grid.
 *
 * Every other way into a record on this cockpit is a route change, and a route
 * change on this page is expensive twice over: the canvas pane is keyed
 * `view:anchor:selectedDay`, so coming back remounts the grid and drops the
 * operator's scroll position at the top of the window; and the thing they were
 * comparing against — the rest of the month — is gone while they look. Notion
 * Calendar's defining move is the opposite: the item opens over the grid, the
 * grid stays exactly where it was, Escape puts you back on the chip you left.
 *
 * ── scope: an ITEM, never a DAY ──────────────────────────────────────────────
 *
 * The day spine (`/calendar/[ymd]`, a 360px column from `lg` up) already
 * answers "what is this DAY" — every job on it with its address, its contact,
 * its paperwork, the drops, the prep tasks and the receivables. This peek
 * answers "what is THIS CHIP", which is a different question with a different
 * cardinality (n:1, not n:few) and is asked from a month grid where the spine
 * is showing some other day entirely — or, on `/calendar` with no day open, is
 * not on screen at all.
 *
 * Where the two WOULD say the same thing — a chip whose day is the day the
 * spine already has open, on a viewport wide enough to show them side by side —
 * the peek stands down and the chip navigates as it always did. A modal
 * restating a pane 300px to its right is not an improvement (see
 * `spineWouldDuplicate` in CalendarCanvas).
 *
 * Deliberately NOT here: the address book, the invoice ledger, the runway. The
 * peek is a landing, not a destination — it names what the chip is and hands
 * over two exits (the record, the day).
 */

const ymdOf = (date: string) => date.slice(0, 10)

/** 'HH:mm' → "4p" / "4:30p". Local to the peek: TimeGridDay's formatter is not
 *  exported and its file is owned elsewhere. */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h)) return hhmm
  const ap = h < 12 ? 'a' : 'p'
  const hh = h % 12 === 0 ? 12 : h % 12
  return m ? `${hh}:${String(m).padStart(2, '0')}${ap}` : `${hh}${ap}`
}

/** "Sat, 22 August 2026 · 4p–8p" / "… · all day". */
function whenLine(item: CalendarItem): string {
  const day = formatLongDate(ymdOf(item.date))
  if (item.endDate && ymdOf(item.endDate) !== ymdOf(item.date)) {
    return `${day} — ${formatLongDate(ymdOf(item.endDate))}`
  }
  if (!item.start) return day
  return `${day} · ${clock(item.start)}${item.end ? `–${clock(item.end)}` : ''}`
}

/** An `https:` maps URL, the same shape the day spine uses — it is the one form
 *  both Android app-links and iOS Safari resolve. */
function mapsHref(place: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(place)}`
}

/** What the record exit is CALLED, per kind. `CALENDAR_KIND_LABELS` names the
 *  row on a grid ("Opportunity date"); the exit names the thing it opens. */
const RECORD_LABEL: Record<CalendarKind, string> = {
  event: 'Open the job',
  lead: 'Open the opportunity',
  task: 'Open the task',
  follow_up: 'Open the follow-up',
  compliance: 'Open the document',
  invoice_due: 'Open the invoice',
  drop: 'Open the drop',
}

/** 44px targets, not the 24px WCAG 2.5.8 floor: these are read on a phone in a
 *  van, and they are the only exits the peek has. */
const EXIT =
  'flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm ' +
  'transition-colors hover:bg-muted focus-visible:bg-muted motion-reduce:transition-none'

/**
 * Where an overlay puts focus back when it closes (WCAG 2.4.3) — the two shapes
 * of Base UI's `finalFocus` the cockpit uses.
 *
 * A ref is the ordinary case. The FUNCTION form is evaluated at close time, and
 * returning `false` means "restore nothing": that is how ⌘K takes over from an
 * open overlay without the dying popup yanking focus back out of the palette a
 * microtask later. `null` falls back to Base UI's own default.
 */
export type FinalFocus =
  | React.RefObject<HTMLElement | null>
  | (() => HTMLElement | null | false)

export interface ItemPeekProps {
  /** null = closed. The peek is keyed on this item by the caller. */
  item: CalendarItem | null
  orgSlug: string
  today: string
  /** Preserved on the "open the day" exit so the view/filter survive the hop. */
  view?: string
  kinds?: string
  onClose: () => void
  /** The chip that opened it — focus goes back there on close (WCAG 2.4.3). */
  finalFocus: FinalFocus
}

export function ItemPeek({ item, orgSlug, today, view, kinds, onClose, finalFocus }: ItemPeekProps) {
  const open = item != null
  // The Dialog closes ITSELF on Escape (Base UI). Registering keeps anything
  // underneath — a bulk selection, the mobile rail drawer — out of the way of
  // that same keypress.
  useTopDismissLayer(open)

  if (!item) return null

  const ymd = ymdOf(item.date)
  const relative = relativeDayLabel(ymd, today)
  const money = item.kind === 'invoice_due' ? item.amount : item.bookedValue
  const dayHref = calendarHref({ orgSlug, view, kinds, ymd })

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent finalFocus={finalFocus} className="max-w-sm gap-0 p-0 text-left">
        {/* `contents` so the marker element adds a test/QA hook without
            disturbing DialogContent's own grid. */}
        <div data-slot="item-peek" className="contents">
        <div className="flex flex-col gap-1 border-b border-border p-4 pr-12">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {/* Colour + shape + an sr-only kind name — the kind is never carried
                by hue alone (WCAG 1.4.1). hideLabel because the visible text
                beside it already spells the kind out. */}
            <KindDot kind={item.kind} hideLabel />
            {CALENDAR_KIND_LABELS[item.kind]}
            {item.tentative ? <span className="text-[var(--status-pending-fg)]">· hold, not booked</span> : null}
          </p>
          <DialogTitle className="text-base leading-snug">{item.title}</DialogTitle>
          <p data-slot="peek-when" className="text-sm text-muted-foreground tabular-nums">
            {whenLine(item)}
            {relative ? <span className="text-xs"> · {relative}</span> : null}
          </p>
        </div>

        <dl className="flex flex-col gap-2.5 p-4">
          {item.detail ? (
            <div>
              <dt className="sr-only">Detail</dt>
              <dd className="text-sm text-foreground">{item.detail}</dd>
            </div>
          ) : null}

          {item.location ? (
            <div>
              <dt className="text-xs text-muted-foreground">Where</dt>
              <dd>
                <a
                  href={mapsHref(item.location)}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(EXIT, 'mt-1 w-full')}
                >
                  <span className="min-w-0 flex-1 truncate">{item.location}</span>
                  <span aria-hidden className="shrink-0 text-xs text-muted-foreground">
                    Directions ↗
                  </span>
                </a>
              </dd>
            </div>
          ) : null}

          {money != null ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">
                {item.kind === 'invoice_due' ? 'Outstanding' : 'Booked value'}
              </dt>
              <dd className="text-sm font-semibold tabular-nums text-[var(--money-green)]">
                {formatMoney(money)}
              </dd>
            </div>
          ) : null}

          {item.headcount != null ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">Pouring for</dt>
              <dd className="text-sm tabular-nums">{item.headcount}</dd>
            </div>
          ) : null}

          {/* A derived signal must explain itself and point at the field that
              produced it, so a wrong verdict is fixable at source. */}
          {item.derived ? (
            <div>
              <dt className="text-xs text-muted-foreground">Why this is showing</dt>
              <dd className="text-sm text-foreground">
                {item.derived.reason}
                {item.derived.fixHref ? (
                  <>
                    {' '}
                    <Link href={item.derived.fixHref} className="underline underline-offset-2">
                      Fix at source
                    </Link>
                  </>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-col gap-2 border-t border-border p-4">
          <Link href={item.href} data-slot="peek-record" className={EXIT}>
            <span>{RECORD_LABEL[item.kind]}</span>
            <span aria-hidden className="shrink-0 text-muted-foreground">
              →
            </span>
          </Link>
          <Link href={dayHref} data-slot="peek-day" className={EXIT}>
            <span>Open {formatLongDate(ymd)}</span>
            <span aria-hidden className="shrink-0 text-muted-foreground">
              →
            </span>
          </Link>
          {canReschedule(item) ? (
            <p className="text-xs text-muted-foreground">
              Close this and the chip keeps focus — <kbd className="font-mono">[</kbd> /{' '}
              <kbd className="font-mono">]</kbd> move it a day.
            </p>
          ) : null}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
