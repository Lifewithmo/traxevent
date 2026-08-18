import { OPEN_STAGES } from '@/lib/leads'
import { rollupCustomer, type CustomerRollup } from '@/lib/crm/customer-rollup'
import type { Customer, Lead, LeadStage } from '@/lib/types'

export type ClientGroup = 'dormant_repeat' | 'booked_now' | 'never_booked'

export interface ClientRow {
  customer: Customer
  rollup: CustomerRollup
  group: ClientGroup
  /** Event date of the most recent won opportunity. */
  lastEventDate?: string
  /** Event date of the earliest won opportunity — used to derive the single gap for two-event clients. */
  firstEventDate?: string
  /** Soonest future event date across won opportunities. */
  nextEventDate?: string
  /** Whole months since lastEventDate; undefined when they've never booked. */
  monthsSinceLastEvent?: number
  /** Average months between won events — only meaningful at 3+ events. */
  cadenceMonths?: number
  /** Whole months past this client's OWN projected re-book beat; undefined when on beat or no cadence. */
  offBeatMonths?: number
  /** Queue-pill text: "2mo overdue" / "due in 3mo" / "due soon"; undefined → rail falls back to time-ago. */
  beatLabel?: string
  /** Second line under the name: the contact, plus the pattern if there is one. */
  detail: string
}

export interface ClientGroupBlock {
  group: ClientGroup
  label: string
  tone: 'urgent' | 'normal'
  rows: ClientRow[]
}

export interface ClientListData {
  blocks: ClientGroupBlock[]
  total: number
  lifetimeValue: number
  worthACall: number
  repeat: number
}

const GROUP_META: Record<ClientGroup, { label: string; tone: 'urgent' | 'normal' }> = {
  dormant_repeat: { label: 'Repeat clients with nothing booked', tone: 'urgent' },
  booked_now: { label: 'Booked with you now', tone: 'normal' },
  never_booked: { label: 'Never booked', tone: 'normal' },
}

const GROUP_ORDER: ClientGroup[] = ['dormant_repeat', 'booked_now', 'never_booked']

export function monthsBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd.slice(0, 10)}T00:00:00.000Z`)
  const b = new Date(`${toYmd.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  return Math.max(0, b.getUTCDate() < a.getUTCDate() ? months - 1 : months)
}

/** Average gap between consecutive won events, in months. Needs three events to mean anything. */
function cadenceOf(eventDates: string[]): number | undefined {
  if (eventDates.length < 3) return undefined
  const sorted = [...eventDates].sort()
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) gaps.push(monthsBetween(sorted[i - 1], sorted[i]))
  const avg = gaps.reduce((n, g) => n + g, 0) / gaps.length
  return Math.max(1, Math.round(avg))
}

export function cadenceLabel(row: ClientRow): string | undefined {
  if (!row.cadenceMonths) return undefined
  if (row.cadenceMonths <= 1) return 'monthly'
  if (row.cadenceMonths === 3) return 'quarterly'
  if (row.cadenceMonths === 6) return 'twice a year'
  if (row.cadenceMonths === 12) return 'yearly'
  return `about every ${row.cadenceMonths} months`
}

// ─── Re-book cadence (beat math) ─────────────────────────────────────────────
// Lives here (not cadence.ts) because buildClientRow/buildClientList consume it;
// cadence.ts re-exports these so its existing importers keep resolving. See the
// doc comment in lib/crm/cadence.ts for the "measure against THEIR beat" rationale.

/** Add whole months to a YYYY-MM-DD date, clamping to the last valid day of the target month. */
function addMonths(ymd: string, months: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return ymd.slice(0, 10)
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months
  const year = Math.floor(total / 12)
  const month = total - year * 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(d.getUTCDate(), lastDay)
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

/**
 * The cadence to project a next booking from:
 * - 3+ won events → the averaged cadence already on the row (`cadenceMonths`)
 * - exactly 2 events → the single gap between them
 * - 1 event → assume yearly (12)
 * - 0 events → null (nothing to project)
 */
export function effectiveCadenceMonths(row: ClientRow): number | null {
  const won = row.rollup.wonCount
  if (won === 0) return null
  if (won === 1) return 12
  if (row.cadenceMonths != null) return row.cadenceMonths
  // Exactly two won events: cadenceMonths stays undefined, so use the raw gap.
  if (row.firstEventDate && row.lastEventDate) {
    return monthsBetween(row.firstEventDate, row.lastEventDate)
  }
  return null
}

/** When this client is due to book again: last event + cadence, as YYYY-MM-DD. */
export function projectedNextBooking(
  lastEventDate: string | null,
  effectiveCadenceMonths: number | null
): string | null {
  if (!lastEventDate || effectiveCadenceMonths == null) return null
  return addMonths(lastEventDate, effectiveCadenceMonths)
}

/**
 * Whole months past the projected next booking. Positive means the client is
 * overdue on their own pattern; null when they are on beat or have no cadence.
 */
export function offBeatMonths(row: ClientRow, todayYmd: string): number | null {
  // A client with a FUTURE booking on the books is on-beat by definition — never
  // "overdue on their pattern," even if their PAST events were off-cadence. This
  // stops a false "Re-book — N mo overdue" nudge (and story dormancy) the moment
  // a client is re-booked.
  if (row.nextEventDate) return null
  const projected = projectedNextBooking(row.lastEventDate ?? null, effectiveCadenceMonths(row))
  if (!projected) return null
  const past = monthsBetween(projected, todayYmd)
  return past > 0 ? past : null
}

/**
 * The rows Clients exists to surface are the ones today's alphabetical table
 * buries: someone who has paid repeatedly and has nothing on the books.
 * Grouping is the sort — dormant repeat business first, prospects last.
 */
export function buildClientRow(customer: Customer, leads: Lead[], today: string): ClientRow {
  const isOpen = (s: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(s)
  const rollup = rollupCustomer(customer, leads)

  const wonEventDates = leads
    .filter((l) => l.stage === 'closed_won' && l.event_date)
    .map((l) => l.event_date!.slice(0, 10))
    .sort()

  const past = wonEventDates.filter((d) => d <= today)
  const future = wonEventDates.filter((d) => d > today)
  const lastEventDate = past[past.length - 1]
  const nextEventDate = future[0]
  const firstEventDate = wonEventDates[0]

  const group: ClientGroup =
    rollup.wonCount > 0 && rollup.openCount === 0 && !nextEventDate
      ? 'dormant_repeat'
      : rollup.wonCount > 0 || rollup.openCount > 0
        ? 'booked_now'
        : 'never_booked'

  const cadenceMonths = cadenceOf(wonEventDates)
  const row: ClientRow = {
    customer,
    rollup,
    group,
    lastEventDate,
    firstEventDate,
    nextEventDate,
    monthsSinceLastEvent: lastEventDate ? monthsBetween(lastEventDate, today) : undefined,
    cadenceMonths,
    detail: '',
  }

  const openLead = leads.find((l) => isOpen(l.stage))
  row.detail = [
    customer.company ? customer.name : undefined,
    cadenceLabel(row) ? `${rollup.wonCount} events · ${cadenceLabel(row)}` : undefined,
    !cadenceMonths && openLead?.title ? openLead.title : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  // Re-book beat: how far past (or how soon until) their OWN cadence. Drives the
  // dormant-group sort and the queue pill's "2mo overdue" / "due in 3mo" signal.
  const off = offBeatMonths(row, today)
  row.offBeatMonths = off ?? undefined
  if (off != null) {
    row.beatLabel = `${off}mo overdue`
  } else if (group === 'dormant_repeat') {
    const projected = projectedNextBooking(lastEventDate ?? null, effectiveCadenceMonths(row))
    if (projected && projected > today) {
      const until = monthsBetween(today, projected)
      row.beatLabel = until === 0 ? 'due soon' : `due in ${until}mo`
    }
  }

  return row
}

export function buildClientList(
  input: { customers: Customer[]; leadsByCustomerId: Record<string, Lead[]> },
  today: string
): ClientListData {
  const rows: ClientRow[] = input.customers.map((customer) =>
    buildClientRow(customer, input.leadsByCustomerId[customer.id] ?? [], today)
  )

  // booked_now / never_booked: whoever has gone quiet longest comes first.
  const quietKey = (r: ClientRow) => r.lastEventDate ?? r.rollup.lastContactAt ?? ''
  // dormant_repeat: rank by re-book beat-urgency — furthest past their OWN cadence
  // first (offBeatMonths DESC), not-yet-off-beat after, ties broken by value DESC.
  // The rail/blocks re-filter by group, so only same-group order matters here.
  const beatCompare = (a: ClientRow, b: ClientRow) => {
    const aOff = a.offBeatMonths ?? -1
    const bOff = b.offBeatMonths ?? -1
    if (aOff !== bOff) return bOff - aOff
    return b.rollup.totalWonValue - a.rollup.totalWonValue
  }
  // Group is the PRIMARY key so cross-group pairs never interleave with a
  // within-group key — that interleaving made the comparator intransitive (a
  // dormant beat-order pair vs a booked quiet-order pair could form a cycle),
  // which left the dormant block's beat ranking undefined on real inputs.
  // Group is the PRIMARY key so cross-group pairs never interleave with a
  // within-group key — that interleaving made the comparator intransitive (a
  // dormant beat-order pair vs a booked quiet-order pair could form a cycle),
  // which left the dormant block's beat ranking undefined on real inputs.
  rows.sort((a, b) => {
    if (a.group !== b.group) return GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    if (a.group === 'dormant_repeat') return beatCompare(a, b)
    return quietKey(a).localeCompare(quietKey(b))
  })

  const blocks = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_META[group].label,
    tone: GROUP_META[group].tone,
    rows: rows.filter((r) => r.group === group),
  })).filter((b) => b.rows.length > 0)

  return {
    blocks,
    total: rows.length,
    lifetimeValue: rows.reduce((n, r) => n + r.rollup.totalWonValue, 0),
    worthACall: rows.filter((r) => r.group === 'dormant_repeat').length,
    repeat: rows.filter((r) => r.rollup.wonCount > 1).length,
  }
}

export function lastEventLabel(row: ClientRow): string {
  if (!row.lastEventDate) return '—'
  const m = row.monthsSinceLastEvent ?? 0
  if (m === 0) return 'This month'
  if (m === 1) return '1 month ago'
  if (m < 12) return `${m} months ago`
  return `${Math.floor(m / 12)}y ${m % 12}mo ago`
}
