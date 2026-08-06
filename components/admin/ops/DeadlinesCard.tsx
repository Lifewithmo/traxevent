'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card>
      <CardHeader><CardTitle className="text-base">Deadlines</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {usesGeneralFallback && (
          <p className="text-xs text-gray-500">
            Your industry has no deadline template yet — these are the general deadline defaults.
          </p>
        )}
        {plan.deadlines.slice().sort((a, b) => a.due.localeCompare(b.due)).map((d) => {
          const overdue = !d.done && d.due < today
          return (
            <label key={d.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label={d.label} checked={d.done} onChange={(e) => handleToggle(d.id, e.target.checked)} />
              <span className={d.done ? 'line-through text-gray-400' : ''}>{d.label}</span>
              <span className={`ml-auto text-xs ${overdue ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                {d.due}{overdue && ' — overdue'}
              </span>
            </label>
          )
        })}
        {plan.deadlines.length === 0 && <p className="text-sm text-gray-500">No deadlines.</p>}
      </CardContent>
    </Card>
  )
}
