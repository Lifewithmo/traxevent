// Pure readiness math for the Ops tab header. No Firestore imports — safe in client components.
import type { OpsPlan } from '@/lib/types'

export interface Readiness {
  days_until: number   // whole days until event start; negative = event has passed
  done: number
  total: number
  pct: number          // 0–100, rounded; 100 when nothing is trackable
  overdue: number      // undone deadlines with due < today
}

const MS_PER_DAY = 86_400_000

export function computeReadiness(plan: OpsPlan, eventStart: string, today: Date = new Date()): Readiness {
  const startDay = eventStart.slice(0, 10)
  const todayDay = today.toISOString().slice(0, 10)
  const days_until = Math.round(
    (new Date(`${startDay}T00:00:00Z`).getTime() - new Date(`${todayDay}T00:00:00Z`).getTime()) / MS_PER_DAY
  )

  const flags = [
    ...plan.deadlines.map((d) => d.done),
    ...plan.shopping_list.map((i) => i.checked),
    ...plan.packing_list.map((i) => i.checked),
    ...plan.checklists.flatMap((c) => c.steps.map((s) => s.done)),
  ]
  const done = flags.filter(Boolean).length
  const total = flags.length

  return {
    days_until,
    done,
    total,
    pct: total === 0 ? 100 : Math.round((done / total) * 100),
    overdue: plan.deadlines.filter((d) => !d.done && d.due < todayDay).length,
  }
}
