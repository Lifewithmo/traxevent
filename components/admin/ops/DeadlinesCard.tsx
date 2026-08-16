'use client'

import { useState } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { toggleDeadline } from '@/actions/event-ops'
import { DEADLINE_TEMPLATES } from '@/lib/ops/derive'
import type { OpsPlan } from '@/lib/types'

interface DeadlinesCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  industryPackId?: string
  onPlanChange: (next: OpsPlan) => void
}

export function DeadlinesCard({ orgId, eventId, plan, industryPackId, onPlanChange }: DeadlinesCardProps) {
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const packId = plan.industry_pack_id ?? industryPackId
  const usesGeneralFallback = packId !== undefined && packId !== 'general' && DEADLINE_TEMPLATES[packId] === undefined

  async function handleToggle(id: string, done: boolean) {
    setError(null)
    try {
      await toggleDeadline(orgId, eventId, id, done)
      onPlanChange({ ...plan, deadlines: plan.deadlines.map((d) => (d.id === id ? { ...d, done } : d)) })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="border-b border-border px-3 py-2">
        <h4 className="text-[13px] font-semibold">Deadlines</h4>
      </header>
      <div className="space-y-2 p-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {usesGeneralFallback && (
          <p className="text-xs text-muted-foreground">
            Your industry has no deadline template yet — these are the general deadline defaults.
          </p>
        )}
        {plan.deadlines.slice().sort((a, b) => a.due.localeCompare(b.due)).map((d) => {
          const overdue = !d.done && d.due < today
          return (
            <label key={d.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label={d.label} checked={d.done} onChange={(e) => handleToggle(d.id, e.target.checked)} />
              <span className={d.done ? 'line-through text-muted-foreground' : ''}>{d.label}</span>
              <span className={`ml-auto text-xs ${overdue ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                {d.due}{overdue && ' — overdue'}
              </span>
            </label>
          )
        })}
        {plan.deadlines.length === 0 && <EmptyState title="No deadlines." />}
      </div>
    </section>
  )
}
