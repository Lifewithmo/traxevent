import type { Lead, Task, Proposal } from '@/lib/types'
import { computeHealth, nextAction, type OppHealth } from '@/lib/opportunity-health'
import { daysSince, lastTouchIso } from '@/lib/opportunity-detail'
import { isProposalOpened } from '@/lib/proposal-opens'
import { CLOSED_STAGES } from '@/lib/leads'
import { wonValueInMonth } from '@/lib/pipeline-stats'

export interface PipelineRow {
  lead: Lead
  health: OppHealth
  statusLine: string
  countdown?: string
  quickAction?: 'set_next_step' | 'nudge'
}
export interface PipelineGroups {
  needs_attention: PipelineRow[]
  waiting: PipelineRow[]
  active: PipelineRow[]
}

export function countdownLabel(dueYmd: string, today: string): string {
  if (dueYmd === today) return 'Today'
  if (dueYmd > today) {
    const n = daysSince(`${today}T00:00:00.000Z`, dueYmd)
    return `in ${n} day${n === 1 ? '' : 's'}`
  }
  const n = daysSince(`${dueYmd}T00:00:00.000Z`, today)
  return `${n} day${n === 1 ? '' : 's'} overdue`
}

/** Newest sent-but-never-opened proposal, or null. Reused by the nudge action. */
export function unopenedSentProposal(proposals: Proposal[]): Proposal | null {
  const candidates = proposals.filter((p) => p.status === 'sent' && !isProposalOpened(p))
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (a.created_at >= b.created_at ? a : b))
}

export function buildPipelineRows(
  inputs: Array<{ lead: Lead; tasks: Task[]; proposals: Proposal[] }>,
  today: string
): PipelineGroups {
  const groups: PipelineGroups = { needs_attention: [], waiting: [], active: [] }
  for (const { lead, tasks, proposals } of inputs) {
    if (CLOSED_STAGES.includes(lead.stage)) continue
    const health = computeHealth(lead, tasks)
    if (health === 'needs_attention') {
      const unopened = unopenedSentProposal(proposals)
      if (unopened) {
        // The sentence needs the actual send time, not draft-creation time; fall back
        // to created_at for legacy proposals with no recorded 'sent' event.
        const sentAt = unopened.events?.find((e) => e.kind === 'sent')?.at ?? unopened.created_at
        const n = daysSince(sentAt, today)
        groups.needs_attention.push({
          lead, health, quickAction: 'nudge',
          statusLine: `Proposal sent ${n} day${n === 1 ? '' : 's'} ago — no opens`,
        })
      } else {
        const quiet = daysSince(lastTouchIso(lead), today)
        groups.needs_attention.push({
          lead, health, quickAction: 'set_next_step',
          statusLine: `No next step — last touched ${quiet} day${quiet === 1 ? '' : 's'} ago`,
        })
      }
    } else if (health === 'waiting') {
      const w = lead.waiting!
      groups.waiting.push({
        lead, health,
        statusLine: `Waiting on them — ${w.reason}${w.follow_up_date ? ` · follow up ${w.follow_up_date}` : ''}`,
        countdown: w.follow_up_date ? countdownLabel(w.follow_up_date, today) : undefined,
      })
    } else if (health === 'active') {
      const next = nextAction(tasks)!
      groups.active.push({
        lead, health,
        statusLine: `Next: ${next.title} · due ${next.due_date}`,
        countdown: next.due_date ? countdownLabel(next.due_date, today) : undefined,
      })
    }
  }
  const byOldestTouch = (a: PipelineRow, b: PipelineRow) =>
    lastTouchIso(a.lead).localeCompare(lastTouchIso(b.lead))
  groups.needs_attention.sort(byOldestTouch)
  groups.waiting.sort(byOldestTouch)
  groups.active.sort(byOldestTouch)
  return groups
}

export function closedThisMonth(leads: Lead[], today: string) {
  const month = today.slice(0, 7)
  const won = wonValueInMonth(leads, month)
  const lost = leads.filter((l) => l.stage === 'closed_lost' && l.closed_at?.slice(0, 7) === month)
  return {
    wonCount: won.count,
    wonValue: won.value,
    lostCount: lost.length,
    lostValue: lost.reduce((s, l) => s + (l.estimated_value ?? 0), 0),
  }
}
