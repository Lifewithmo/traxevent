import type { Proposal, Invoice, Vendor, LeadStage, Task } from '@/lib/types'
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

/** Whole calendar days between an ISO timestamp's date part and todayYmd. */
export function daysSince(iso: string, todayYmd: string): number {
  const a = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime()
  const b = new Date(`${todayYmd}T00:00:00.000Z`).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function lastTouchIso(lead: { last_touch_at?: string; updated_at?: string; created_at: string }): string {
  return lead.last_touch_at ?? lead.updated_at ?? lead.created_at
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
  lastTouchDays?: number
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
    case 'needs_attention': {
      const touch = o.lastTouchDays != null
        ? ` Last touch ${o.lastTouchDays} day${o.lastTouchDays === 1 ? '' : 's'} ago.`
        : ''
      return {
        tone: 'attention',
        heading: 'No next action',
        detail: `This opportunity has nothing scheduled — add a next step so it never rots.${touch}`,
      }
    }
    case 'closed':
    default:
      return { tone: 'closed', heading: 'Closed', detail: o.stageLabel }
  }
}

/** Why the convert card is blocked (or what would unblock it) short of closed_won. */
export function convertBlockReason(i: {
  stage: LeadStage
  proposals: Pick<Proposal, 'status'>[]
  guestCount?: number
}): { ready: boolean; message: string } {
  if (i.stage === 'closed_won') return { ready: true, message: '' }
  // Signing IS accepting (signProposal writes status + signature together),
  // so an accepted proposal is a signed document — no separate contract gate.
  if (!i.proposals.some((p) => p.status === 'accepted')) {
    const guests = i.guestCount != null ? ` and ${i.guestCount} guests` : ''
    return { ready: false, message: `Blocked: no signed proposal yet. Signed acceptance carries the accepted package${guests} into Events.` }
  }
  return { ready: false, message: 'Ready — mark the deal won to convert.' }
}

export interface AttachmentChip {
  kind: 'task' | 'proposal' | 'invoice' | 'vendor'
  label: string
  count: number
  hint?: string
  danger?: boolean
}

export function attachmentChips(i: {
  tasks: Task[]
  proposals: Proposal[]
  invoices: Invoice[]
  vendors: Vendor[]
  today: string
}): AttachmentChip[] {
  const openTasks = i.tasks.filter((t) => !t.done)
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < i.today).length
  const dated = openTasks.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  const shortDue = (ymd: string) => {
    const [, m, d] = ymd.split('-').map(Number)
    return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`
  }
  const tasksChip: AttachmentChip = {
    kind: 'task', label: 'Tasks', count: openTasks.length,
    ...(overdue
      ? { hint: `${overdue} overdue`, danger: true }
      : dated.length ? { hint: `next due ${shortDue(dated[0].due_date!)}` } : {}),
  }

  const accepted = i.proposals.filter((p) => p.status === 'accepted').length
  // Invoices moved to a lifecycle + balance model (Invoice.status was removed).
  // "Outstanding" = not void and still carrying a positive balance.
  const isDead = (v: Invoice) => v.lifecycle === 'void'
  const outstanding = i.invoices.filter((v) => !isDead(v) && invoiceBalance(v) > 0).length
  const anyLiveInvoice = i.invoices.some((v) => !isDead(v))
  const confirmed = i.vendors.filter((v) => v.status === 'confirmed').length
  return [
    tasksChip,
    { kind: 'proposal', label: 'Proposals', count: i.proposals.length, hint: accepted ? `${accepted} accepted` : undefined },
    { kind: 'invoice', label: 'Invoices', count: i.invoices.length, hint: outstanding ? `${outstanding} unpaid` : (anyLiveInvoice ? 'paid' : undefined), danger: outstanding > 0 ? true : undefined },
    { kind: 'vendor', label: 'Vendors', count: i.vendors.length, hint: confirmed ? `${confirmed} confirmed` : undefined },
  ]
}
