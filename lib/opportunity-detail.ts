import type { Proposal, Invoice, Contract, Vendor } from '@/lib/types'
import type { OppHealth } from '@/lib/opportunity-health'
import { invoiceBalance } from '@/lib/invoices'

/** Up to two uppercase initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** ISO date (YYYY-MM-DD) `days` after the given YYYY-MM-DD base. */
export function addDays(baseYmd: string, days: number): string {
  const d = new Date(`${baseYmd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Local calendar date as YYYY-MM-DD (matches <input type="date"> values). */
export function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type DueStatus = 'overdue' | 'today' | 'upcoming'

export function dueStatus(dueYmd: string, today: string): DueStatus {
  if (dueYmd < today) return 'overdue'
  if (dueYmd === today) return 'today'
  return 'upcoming'
}

/** Coarse "n ago" label for activity/timeline. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

export interface BannerContent {
  tone: 'active' | 'waiting' | 'attention' | 'closed'
  heading: string
  detail: string
}

export interface BannerInput {
  nextTitle?: string
  dueYmd?: string
  todayYmd: string
  waitingReason?: string
  waitingFollowUp?: string
  stageLabel: string
}

function dueLabel(dueYmd: string, today: string): string {
  const s = dueStatus(dueYmd, today)
  if (s === 'overdue') return `Overdue · was due ${dueYmd}`
  if (s === 'today') return 'Due today'
  return `Due ${dueYmd}`
}

export function bannerContent(health: OppHealth, o: BannerInput): BannerContent {
  switch (health) {
    case 'active':
      return {
        tone: 'active',
        heading: o.nextTitle ?? 'Next action',
        detail: o.dueYmd ? dueLabel(o.dueYmd, o.todayYmd) : 'Scheduled',
      }
    case 'waiting':
      return {
        tone: 'waiting',
        heading: 'Waiting',
        detail: [o.waitingReason, o.waitingFollowUp ? `follow up ${o.waitingFollowUp}` : null]
          .filter(Boolean)
          .join(' · ') || 'Waiting on a reply',
      }
    case 'needs_attention':
      return {
        tone: 'attention',
        heading: 'No next action',
        detail: 'This opportunity has nothing scheduled — add a next step so it never rots.',
      }
    case 'closed':
    default:
      return { tone: 'closed', heading: 'Closed', detail: o.stageLabel }
  }
}

export interface AttachmentChip {
  kind: 'proposal' | 'invoice' | 'contract' | 'vendor'
  label: string
  count: number
  hint?: string
}

export function attachmentChips(i: {
  proposals: Proposal[]
  invoices: Invoice[]
  contracts: Contract[]
  vendors: Vendor[]
}): AttachmentChip[] {
  const accepted = i.proposals.filter((p) => p.status === 'accepted').length
  // Invoices moved to a lifecycle + balance model (Invoice.status was removed).
  // "Outstanding" = not voided/replaced and still carrying a positive balance.
  const isDead = (v: Invoice) => v.lifecycle === 'voided' || v.lifecycle === 'replaced'
  const outstanding = i.invoices.filter((v) => !isDead(v) && invoiceBalance(v) > 0).length
  const anyLiveInvoice = i.invoices.some((v) => !isDead(v))
  const signed = i.contracts.filter((c) => c.status === 'signed').length
  const confirmed = i.vendors.filter((v) => v.status === 'confirmed').length
  return [
    { kind: 'proposal', label: 'Proposals', count: i.proposals.length, hint: accepted ? `${accepted} accepted` : undefined },
    { kind: 'invoice', label: 'Invoices', count: i.invoices.length, hint: outstanding ? `${outstanding} unpaid` : (anyLiveInvoice ? 'paid' : undefined) },
    { kind: 'contract', label: 'Contracts', count: i.contracts.length, hint: signed ? 'signed' : (i.contracts.length ? 'unsigned' : undefined) },
    { kind: 'vendor', label: 'Vendors', count: i.vendors.length, hint: confirmed ? `${confirmed} confirmed` : undefined },
  ]
}
