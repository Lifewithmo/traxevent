/**
 * Tolerant parsing of the dates a human actually types into a command bar.
 *
 * The calendar's ⌘K jump used to require a literal `YYYY-MM-DD`, so every
 * natural thing an operator types at a scheduling surface — "sep 13", "9/13",
 * "next sat", "+2w" — dead-ended on "No matches". This module is the parser
 * that fixes that. It is pure logic on purpose: it lives outside the component
 * so it can be exhaustively unit-tested, and so the next surface that wants a
 * date box gets it for free.
 *
 * NO DATE LIBRARY. This is hand-rolled against the repo's date discipline:
 * every Date is built as `new Date(\`${ymd}T00:00:00.000Z\`)` (or Date.UTC),
 * every read is a `getUTC*`, and every return value is a `YYYY-MM-DD` string.
 * A bare `new Date(someString)` appears nowhere below — that is the exact
 * footgun (engine-lenient, local-timezone) this repo has been bitten by.
 *
 * ── The ambiguity rule ────────────────────────────────────────────────────
 * A form that carries no year (`9/13`, `sep 13`, `13 september`) resolves to
 * the NEXT OCCURRENCE ON OR AFTER TODAY — never "this calendar year".
 *
 * Why: the operator typing into a scheduling command bar is overwhelmingly
 * looking forward (book it, check it, staff it). On 2026-08-22, "9/13" means
 * this September; "1/5" means January 2027, not a January that has already
 * happened. "This year" would send half of a Q4 user's jumps into the past.
 *
 * Two consequences fall out of the same rule, and both are deliberate:
 *   • Today itself counts as an occurrence, so on 2026-09-13 "9/13" is today.
 *   • "2/29" walks forward to the next year that actually HAS a Feb 29
 *     (from 2026 → 2028), instead of failing. An explicit `2/29/2027` still
 *     returns null, because that date does not exist and the user said which
 *     year they meant.
 *
 * The rule is only safe because it is visible: `assumedYear` is reported back
 * so the caller can show the resolved year in a confirmable preview before
 * anyone navigates. Never resolve silently.
 */

import { addDays, parseYmd } from '@/lib/opportunity-detail'

/** Which shape matched — surfaced for tests and for caller-side treatment. */
export type DatePhraseForm = 'iso' | 'numeric' | 'month-name' | 'keyword' | 'weekday' | 'offset'

export interface ParsedDatePhrase {
  /** Always a real, existing calendar date as `YYYY-MM-DD`. */
  ymd: string
  form: DatePhraseForm
  /**
   * True when the input carried no year and the next-occurrence rule picked
   * one. The caller MUST show the resolved year before navigating.
   */
  assumedYear: boolean
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

/** Anything outside this is a typo, not a date the calendar can show. */
const MIN_YEAR = 1900
const MAX_YEAR = 2999

/** How far forward the next-occurrence rule will walk. 8 clears the widest
 *  leap gap there is (2096 → 2104, since 2100 is not a leap year). */
const MAX_YEAR_WALK = 8

/** Longer than this is prose, not a date — bail before any regex runs. */
const MAX_INPUT = 40

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`
}

/** Days in a 1-indexed month — `day 0` of the next month is the last of this one. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Does this y/m/d name a date that exists, in a year we are willing to show? */
function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (y < MIN_YEAR || y > MAX_YEAR) return false
  if (m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m)
}

function ymdParts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

function utcDow(ymd: string): number {
  return new Date(`${ymd}T00:00:00.000Z`).getUTCDay()
}

/** Month arithmetic that CLAMPS rather than rolls over: Jan 31 +1m is Feb 28,
 *  not March 3. Rolling over is the behaviour nobody means by "next month". */
function shiftMonths(ymd: string, months: number): string {
  const { y, m, d } = ymdParts(ymd)
  const zeroBased = y * 12 + (m - 1) + months
  const ny = Math.floor(zeroBased / 12)
  const nm = ((zeroBased % 12) + 12) % 12 + 1
  return toYmd(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** Two-digit years are this century; four-digit years are taken literally. */
function normalizeYear(raw: string): number {
  const n = Number(raw)
  return raw.length === 2 ? 2000 + n : n
}

/**
 * Resolve a month/day with no year under the next-occurrence rule, walking
 * forward until the date both exists and is not in the past.
 */
function nextOccurrence(month: number, day: number, todayYmd: string): string | null {
  const startYear = ymdParts(todayYmd).y
  for (let i = 0; i <= MAX_YEAR_WALK; i++) {
    const y = startYear + i
    if (!isRealDate(y, month, day)) continue
    const candidate = toYmd(y, month, day)
    // Lexicographic compare is date compare for zero-padded ISO.
    if (candidate >= todayYmd) return candidate
  }
  return null
}

/** Shortest prefix we will accept for a month or weekday name. One letter is
 *  never enough ("s" is both September and Saturday's initial), two often is. */
const MIN_NAME_PREFIX = 2

/**
 * Unique-prefix lookup over a name table.
 *
 * Two guards, and both are load-bearing — the shapes below hand this ANY word,
 * so this function, not a regex quantifier, is what decides:
 *   • too short — "s 13" could be September; refuse rather than pick.
 *   • ambiguous — "ju 13" is June or July; refuse rather than pick.
 * Everything unique is accepted, so "se", "sept", "september" and "thurs" all
 * resolve (recognition over recall — the operator should not have to remember
 * which abbreviation we settled on).
 */
function matchName(table: string[], token: string): number {
  const t = token.toLowerCase().replace(/\.$/, '')
  if (t.length < MIN_NAME_PREFIX) return -1
  let hit = -1
  for (let i = 0; i < table.length; i++) {
    if (!table[i].toLowerCase().startsWith(t)) continue
    if (hit !== -1) return -1 // ambiguous — refuse rather than guess
    hit = i
  }
  return hit
}

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const NUMERIC_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/
// The name slots take any word: matchName is the single authority on whether it
// is a real, unambiguous month/weekday.
const MONTH_FIRST_RE = /^([a-z]{1,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{2}|\d{4}))?$/i
const DAY_FIRST_RE = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{1,9})\.?,?(?:\s+(\d{2}|\d{4}))?$/i
const WEEKDAY_RE = /^(next|this|last|coming)\s+([a-z]{1,9})\.?$/i
const OFFSET_RE = /^([+-])\s*(\d{1,4})\s*(d|w|m|y|days?|weeks?|months?|years?)$/i

/**
 * Parse one human date phrase relative to `todayYmd`, or null if it is not a
 * date at all. Never throws, never guesses past an ambiguity.
 *
 * Accepted, in the order they are tried:
 *   today | tomorrow | yesterday
 *   2026-09-13                     (ISO; must be a date that exists)
 *   9/13 · 09/13 · 9/13/27 · 9/13/2027
 *   se 13 · sep 13 · sept 13 · September 13, 2027 · 13 sep · 13th september 2027
 *   next sat · this friday · last mon · coming tue
 *
 * A month or weekday name is accepted from any UNAMBIGUOUS prefix of two or
 * more letters, so "ju 13" (June or July?) and "s 13" are refused, not guessed.
 *   +2w · -3d · +1m · +1y · "+2 weeks"
 */
export function parseDatePhrase(input: string, todayYmd: string): ParsedDatePhrase | null {
  if (typeof input !== 'string' || typeof todayYmd !== 'string') return null
  if (!parseYmd(todayYmd)) return null

  const raw = input.trim().replace(/\s+/g, ' ')
  if (!raw || raw.length > MAX_INPUT) return null
  const lower = raw.toLowerCase()

  // ── keywords ────────────────────────────────────────────────────────────
  if (lower === 'today') return { ymd: todayYmd, form: 'keyword', assumedYear: false }
  if (lower === 'tomorrow') return { ymd: addDays(todayYmd, 1), form: 'keyword', assumedYear: false }
  if (lower === 'yesterday') return { ymd: addDays(todayYmd, -1), form: 'keyword', assumedYear: false }

  // ── ISO ─────────────────────────────────────────────────────────────────
  const iso = ISO_RE.exec(raw)
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    if (!isRealDate(y, m, d)) return null
    return { ymd: toYmd(y, m, d), form: 'iso', assumedYear: false }
  }

  // ── M/D and M/D/YY(YY) ──────────────────────────────────────────────────
  const num = NUMERIC_RE.exec(raw)
  if (num) {
    const m = Number(num[1])
    const d = Number(num[2])
    // Deliberately NOT D/M. If the month slot is out of range we refuse rather
    // than transposing — silently reading "13/9" as 13 September is exactly the
    // kind of confident wrong answer that gets someone booked on the wrong day.
    if (m < 1 || m > 12) return null
    if (num[3]) {
      const y = normalizeYear(num[3])
      if (!isRealDate(y, m, d)) return null
      return { ymd: toYmd(y, m, d), form: 'numeric', assumedYear: false }
    }
    const ymd = nextOccurrence(m, d, todayYmd)
    return ymd ? { ymd, form: 'numeric', assumedYear: true } : null
  }

  // ── month names, either order ───────────────────────────────────────────
  const monthFirst = MONTH_FIRST_RE.exec(raw)
  const dayFirst = monthFirst ? null : DAY_FIRST_RE.exec(raw)
  const named = monthFirst
    ? { monthTok: monthFirst[1], day: Number(monthFirst[2]), year: monthFirst[3] }
    : dayFirst
      ? { monthTok: dayFirst[2], day: Number(dayFirst[1]), year: dayFirst[3] }
      : null
  if (named) {
    const mi = matchName(MONTH_NAMES, named.monthTok)
    if (mi !== -1) {
      const m = mi + 1
      if (named.year) {
        const y = normalizeYear(named.year)
        if (!isRealDate(y, m, named.day)) return null
        return { ymd: toYmd(y, m, named.day), form: 'month-name', assumedYear: false }
      }
      const ymd = nextOccurrence(m, named.day, todayYmd)
      return ymd ? { ymd, form: 'month-name', assumedYear: true } : null
    }
    // Not a month name — fall through; it is probably a customer's name.
  }

  // ── next/this/last <weekday> ────────────────────────────────────────────
  const wk = WEEKDAY_RE.exec(raw)
  if (wk) {
    const wi = matchName(WEEKDAY_NAMES, wk[2])
    if (wi !== -1) {
      const dir = wk[1].toLowerCase()
      const from = utcDow(todayYmd)
      let delta: number
      if (dir === 'last') {
        // strictly before today
        delta = -(((from - wi + 7 - 1) % 7) + 1)
      } else if (dir === 'this') {
        // today counts
        delta = (wi - from + 7) % 7
      } else {
        // next / coming — strictly after today, so "next sat" on a Saturday is +7
        delta = ((wi - from + 7 - 1) % 7) + 1
      }
      return { ymd: addDays(todayYmd, delta), form: 'weekday', assumedYear: false }
    }
    return null
  }

  // ── +2w / -3d / +1m / +1y ───────────────────────────────────────────────
  const off = OFFSET_RE.exec(raw)
  if (off) {
    const sign = off[1] === '-' ? -1 : 1
    const n = sign * Number(off[2])
    const unit = off[3].toLowerCase()[0]
    const ymd =
      unit === 'd' ? addDays(todayYmd, n)
        : unit === 'w' ? addDays(todayYmd, n * 7)
          : unit === 'm' ? shiftMonths(todayYmd, n)
            : shiftMonths(todayYmd, n * 12)
    const { y } = ymdParts(ymd)
    if (y < MIN_YEAR || y > MAX_YEAR) return null
    return { ymd, form: 'offset', assumedYear: false }
  }

  return null
}

/**
 * The confirmable echo: "Sunday, 13 September 2026".
 *
 * Built from constant name tables rather than `toLocaleDateString` so the
 * string is deterministic — the whole point is that the operator can check the
 * parse before committing, and a preview that shifts with the host machine's
 * ICU data is not checkable (nor testable).
 */
export function formatLongDate(ymd: string): string {
  if (!parseYmd(ymd)) return ymd
  const { y, m, d } = ymdParts(ymd)
  return `${WEEKDAY_NAMES[utcDow(ymd)]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

/** "today" | "tomorrow" | "yesterday" | "in 22 days" | "22 days ago". */
export function relativeDayLabel(ymd: string, todayYmd: string): string {
  if (!parseYmd(ymd) || !parseYmd(todayYmd)) return ''
  const diff = Math.round(
    (Date.parse(`${ymd}T00:00:00.000Z`) - Date.parse(`${todayYmd}T00:00:00.000Z`)) / 86_400_000
  )
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`
}
