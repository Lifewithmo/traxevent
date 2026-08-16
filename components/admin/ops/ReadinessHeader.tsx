'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { acknowledgeReview } from '@/actions/event-ops'
import { computeReadiness } from '@/lib/ops/readiness'
import type { OpsPlan } from '@/lib/types'

interface ReadinessHeaderProps {
  plan: OpsPlan
  /** The shared event spine owns the event name — kept for call-site compatibility, unused here. */
  eventName: string
  eventStart: string
  orgId: string
  eventId: string
  orgSlug: string
  eventSlug: string
  complianceWarnings: { name: string; expires_on: string }[]
  onPlanChange: (next: OpsPlan) => void
}

export function ReadinessHeader({ plan, eventStart, orgId, eventId, orgSlug, eventSlug, complianceWarnings, onPlanChange }: ReadinessHeaderProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const r = computeReadiness(plan, eventStart)

  async function handleAcknowledge() {
    setSaving(true); setError(null)
    try {
      await acknowledgeReview(orgId, eventId)
      onPlanChange({ ...plan, needs_review: false })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h4 className="text-[13px] font-semibold">Readiness</h4>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/${orgSlug}/${eventSlug}/ops/closeout`} />}>
          Closeout
        </Button>
      </header>
      <div className="space-y-3 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="text-2xl font-bold tabular-nums">{r.pct}%</span>
            <p className="text-xs text-muted-foreground">{r.done}/{r.total} done</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="text-sm text-muted-foreground">
              {r.days_until >= 0 ? `${r.days_until} days until event` : `event was ${-r.days_until} days ago`}
            </p>
            {r.overdue > 0 && <StatusPill tone="alert">{r.overdue} overdue</StatusPill>}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${r.pct}%` }} />
        </div>

        {plan.needs_review && (
          <div className="space-y-2 rounded-md border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2.5">
            <p className="text-sm font-medium text-[var(--warn-fg)]">
              Requirements changed — shopping quantities were re-derived. Review the lists below.
            </p>
            <Button size="sm" variant="outline" disabled={saving} onClick={handleAcknowledge}>Acknowledge</Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {complianceWarnings.length > 0 && (
          <div className="space-y-1 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5">
            <p className="text-sm font-medium text-[var(--danger-fg)]">Compliance documents expire before this event:</p>
            <ul className="list-disc pl-5 text-sm text-[var(--danger-fg)]">
              {complianceWarnings.map((w) => (
                <li key={w.name}>{w.name} — expires {w.expires_on}</li>
              ))}
            </ul>
            <Link href={`/${orgSlug}/compliance`} className="text-xs text-[var(--danger-text)] underline">Open compliance tracker</Link>
          </div>
        )}
      </div>
    </section>
  )
}
