'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { acknowledgeReview } from '@/actions/event-ops'
import { computeReadiness } from '@/lib/ops/readiness'
import type { OpsPlan } from '@/lib/types'

interface ReadinessHeaderProps {
  plan: OpsPlan
  eventName: string
  eventStart: string
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  complianceWarnings: { name: string; expires_on: string }[]
  onPlanChange: (next: OpsPlan) => void
}

export function ReadinessHeader({ plan, eventName, eventStart, orgId, eventId, orgSlug, eventSlug, complianceWarnings, onPlanChange }: ReadinessHeaderProps) {
  const [saving, setSaving] = useState(false)
  const r = computeReadiness(plan, eventStart)

  async function handleAcknowledge() {
    setSaving(true)
    try {
      await acknowledgeReview(orgId, eventId)
      onPlanChange({ ...plan, needs_review: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Event Ops — {eventName}</h1>
          <p className="text-sm text-gray-500">
            {r.days_until >= 0 ? `${r.days_until} days until event` : `event was ${-r.days_until} days ago`}
            {r.overdue > 0 && <span className="ml-2 font-medium text-red-600">{r.overdue} overdue</span>}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-2xl font-bold">{r.pct}%</span>
            <p className="text-xs text-gray-500">{r.done}/{r.total} done</p>
          </div>
          <Link href={`/${orgSlug}/${eventSlug}/ops/closeout`} className="text-sm underline text-gray-700">
            Closeout
          </Link>
        </div>
      </div>
      <div className="h-2 rounded bg-gray-200 overflow-hidden">
        <div className="h-full bg-gray-900 transition-all" style={{ width: `${r.pct}%` }} />
      </div>

      {plan.needs_review && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900 font-medium">
            Requirements changed — shopping quantities were re-derived. Review the lists below.
          </p>
          <Button size="sm" variant="outline" disabled={saving} onClick={handleAcknowledge}>Acknowledge</Button>
        </div>
      )}

      {complianceWarnings.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-900">Compliance documents expire before this event:</p>
          <ul className="text-sm text-red-800 list-disc pl-5">
            {complianceWarnings.map((w) => (
              <li key={w.name}>{w.name} — expires {w.expires_on}</li>
            ))}
          </ul>
          <Link href={`/${orgSlug}/compliance`} className="text-xs underline text-red-900">Open compliance tracker</Link>
        </div>
      )}
    </div>
  )
}
