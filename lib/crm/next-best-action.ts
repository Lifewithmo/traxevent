import { OPEN_STAGES, opportunityTitle } from '@/lib/leads'
import { offBeatMonths } from '@/lib/crm/cadence'
import { formatMoney } from '@/lib/money'
import type { ClientRow } from '@/lib/crm/client-list'
import type { CustomerAR } from '@/lib/crm/ar-rollup'
import type { Invoice, Lead, LeadStage } from '@/lib/types'

/**
 * The single most valuable next move for one client, computed and ranked so the
 * cockpit can stop one step short of the action no longer. Priority is fixed:
 *   ① money owed (overdue AR) beats
 *   ② an open opportunity to follow up on, beats
 *   ③ a repeat client past their own re-book beat, beats
 *   ④ a never-booked prospect to send a first proposal, beats
 *   ⑤ nothing — they're booked, paid, and on time.
 * Pure: no I/O. Reads real AR (never quoted pipeline) for the money branch.
 */
export type NextBestActionKind = 'reminder' | 'followup' | 'rebook' | 'send-proposal' | 'none'

export interface NextBestAction {
  kind: NextBestActionKind
  label: string
  reason: string
}

export interface NextBestActionInput {
  row: ClientRow
  opportunities: Lead[]
  invoices: Invoice[]
  ar: CustomerAR
  todayYmd: string
}

const isOpen = (stage: LeadStage) => (OPEN_STAGES as LeadStage[]).includes(stage)

export function nextBestAction(input: NextBestActionInput): NextBestAction {
  const { row, opportunities, ar, todayYmd } = input

  // ① Overdue AR — real money owed comes before any pipeline move.
  if (ar.overdueAmount > 0) {
    return {
      kind: 'reminder',
      label: `Send reminder — ${formatMoney(ar.overdueAmount)} overdue`,
      reason: 'Payment is past due — nudge them to pay.',
    }
  }

  // ② Open opportunity — someone is mid-conversation; keep it moving.
  const openLead = opportunities.find((l) => isOpen(l.stage))
  if (openLead) {
    const detail = openLead.waiting?.reason ?? opportunityTitle(openLead)
    return {
      kind: 'followup',
      label: `Follow up — ${detail}`,
      reason: 'An open opportunity is waiting on you.',
    }
  }

  // ③ Off their own re-book beat — a repeat client overdue to book again.
  const off = offBeatMonths(row, todayYmd)
  if (off != null && off > 0) {
    return {
      kind: 'rebook',
      label: `Re-book — ${off}mo overdue on their pattern`,
      reason: 'Past due on their own re-book cadence.',
    }
  }

  // ④ Never booked — a prospect who has never bought; open with a proposal.
  if (row.group === 'never_booked') {
    return {
      kind: 'send-proposal',
      label: 'Send proposal',
      reason: 'Never booked — start with a proposal.',
    }
  }

  // ⑤ Booked, paid, and on beat — nothing needs a nudge.
  return {
    kind: 'none',
    label: 'New job',
    reason: 'Healthy — nothing needs a nudge right now.',
  }
}
