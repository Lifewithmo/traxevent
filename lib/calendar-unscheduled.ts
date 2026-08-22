import type { UnscheduledItem } from '@/lib/calendar'
import { formatMoney } from '@/lib/money'
import type { Lead } from '@/lib/types'

/**
 * The presentation layer for `buildUnscheduled` — everything the rail's
 * Unscheduled section needs to READ a row, kept pure and out of the JSX.
 *
 * Ranking is NOT here. `buildUnscheduled` owns the order (book-by ascending,
 * then value, then oldest-waiting, then id — a deliberately transitive
 * comparator, see PR #114) and the section renders it as-returned. What this
 * module adds is the one thing an `UnscheduledItem` cannot say about itself,
 * and the sentence that says why the row is in the list.
 */

/** Signed whole calendar days from `fromYmd` to `toYmd`; negative = in the past. */
function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd.slice(0, 10)}T00:00:00.000Z`).getTime()
  const b = new Date(`${toYmd.slice(0, 10)}T00:00:00.000Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** The calendar module's date vocabulary — "Aug 24", never a locale long form.
 *  A 280px rail cannot afford "August 24, 2026" on a second line. */
function shortDate(ymd: string): string {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * A `buildUnscheduled` row plus the fact the item itself cannot carry: whether
 * the work is already SOLD.
 *
 * `UnscheduledItem` has no stage, and after the closed_won filter fix (see
 * `buildUnscheduled`'s `isOpen`) a won-but-unconverted opportunity arrives with
 * `kind: 'lead'` and the same `detail: 'no date set'` as a cold inquiry — so the
 * tier is NOT readable off the item, and sniffing the `detail` string for the
 * word "booked" would be a presentation hack that silently mis-tiers the exact
 * row the drawer exists for. It is derived here from the lead stages the source
 * load already has in memory, which costs nothing and is right both before and
 * after that one-line change lands.
 */
export interface UnscheduledRow extends UnscheduledItem {
  /** Sold, and still has no day: an undated event, or a `closed_won`
   *  opportunity nobody converted. Not a hold — a promise already broken on
   *  every calendar surface. */
  committed: boolean
}

/** Tag each row with whether its opportunity is sold. `leads` is the SAME array
 *  the rows were built from — no extra read, no extra query. */
export function markCommitted(
  items: UnscheduledItem[],
  leads: ReadonlyArray<Pick<Lead, 'id' | 'stage'>>
): UnscheduledRow[] {
  const wonLeadIds = new Set(leads.filter((l) => l.stage === 'closed_won').map((l) => l.id))
  return items.map((i) => ({
    ...i,
    // An undated EVENT is booked work by construction (conversion is what makes
    // an event), so it is committed whatever its lead now says.
    committed: i.kind === 'event' || (i.leadId != null && wonLeadIds.has(i.leadId)),
  }))
}

/** How loudly the row reads. Never the only channel — every level ships words. */
export type UnscheduledUrgency = 'now' | 'soon' | 'later'

export interface UnscheduledReason {
  level: UnscheduledUrgency
  /** The whole "why this is here" sentence, e.g. "Book by Aug 24 · 3d past due". */
  text: string
}

/** Inside the prep window the pipeline already treats as the alarm threshold
 *  (`bookByChip`, PipelineListClient) — one number, one meaning, two modules. */
const SOON_DAYS = 7

/**
 * Why the row is urgent, in words, with the tone that matches them.
 *
 * Order of evidence mirrors the comparator that ranked the list, so the sentence
 * explains the position: the book-by deadline first, the money second, the wait
 * last. A row with none of the three still says something true rather than
 * rendering an empty second line.
 *
 * COMMITTED WORK FLOORS AT `now`. A sold job with no date is not a countdown —
 * it is already invisible on every calendar the crew and the customer can see,
 * so it reads at the top tone whatever its deadline says. The deadline text
 * still separates "3d past due" from "62d left", so flooring the tone loses no
 * information; it only stops a broken promise reading as calm.
 */
export function unscheduledReason(row: UnscheduledRow, today: string): UnscheduledReason {
  const floor = (level: UnscheduledUrgency): UnscheduledUrgency => (row.committed ? 'now' : level)

  if (row.bookByDate) {
    const d = daysBetweenYmd(today, row.bookByDate)
    const remaining = d < 0 ? `${-d}d past due` : d === 0 ? 'due today' : `${d}d left`
    return {
      level: floor(d <= 0 ? 'now' : d <= SOON_DAYS ? 'soon' : 'later'),
      text: `Book by ${shortDate(row.bookByDate)} · ${remaining}`,
    }
  }

  if (row.value != null && row.value > 0) {
    // Money is the SECOND ranking key, so it is the second-best explanation of
    // the row's position — and the only honest one when no date was promised.
    return { level: floor('later'), text: `${formatMoney(row.value)} · no date promised` }
  }

  const waited = Math.max(0, daysBetweenYmd(row.createdAt, today))
  return {
    level: floor('later'),
    text: waited === 0 ? 'Added today · no date promised' : `Waiting ${waited}d · no date promised`,
  }
}
