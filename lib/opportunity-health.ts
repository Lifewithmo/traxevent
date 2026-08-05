import type { Lead, Task } from '@/lib/types'
import { CLOSED_STAGES } from '@/lib/leads'

export type OppHealth = 'active' | 'waiting' | 'needs_attention' | 'closed'

export function nextAction(tasks: Task[]): Task | null {
  const open = tasks.filter((t) => !t.done && t.due_date)
  if (open.length === 0) return null
  return open.reduce((a, b) => (a.due_date! <= b.due_date! ? a : b))
}

export function computeHealth(lead: Pick<Lead, 'stage' | 'waiting'>, tasks: Task[]): OppHealth {
  if (CLOSED_STAGES.includes(lead.stage)) return 'closed'
  if (lead.waiting) return 'waiting'
  return nextAction(tasks) ? 'active' : 'needs_attention'
}
