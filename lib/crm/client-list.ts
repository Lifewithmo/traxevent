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

  return row
}

export function buildClientList(
  input: { customers: Customer[]; leadsByCustomerId: Record<string, Lead[]> },
  today: string
): ClientListData {
  const rows: ClientRow[] = input.customers.map((customer) =>
    buildClientRow(customer, input.leadsByCustomerId[customer.id] ?? [], today)
  )

  // Within a group, whoever has gone quiet longest comes first.
  const quietKey = (r: ClientRow) => r.lastEventDate ?? r.rollup.lastContactAt ?? ''
  rows.sort((a, b) => quietKey(a).localeCompare(quietKey(b)))

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
