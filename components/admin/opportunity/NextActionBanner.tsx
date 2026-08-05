'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Check, Clock, AlertCircle, CheckCircle2, PlusCircle } from 'lucide-react'
import { computeHealth, nextAction } from '@/lib/opportunity-health'
import { bannerContent, todayYmd, addDays } from '@/lib/opportunity-detail'
import { completeTask, snoozeTask } from '@/actions/tasks'
import { LEAD_STAGE_LABELS } from '@/lib/leads'
import type { Lead, Task } from '@/lib/types'

interface NextActionBannerProps {
  orgId: string
  lead: Lead
  tasks: Task[]
  onAddNextStep: () => void
}

const TONE: Record<string, string> = {
  active: 'border-primary/30 bg-primary/5',
  waiting: 'border-amber-300 bg-amber-50 dark:bg-amber-950/30',
  attention: 'border-destructive/40 bg-destructive/5',
  closed: 'border-border bg-muted/40',
}

export function NextActionBanner({ orgId, lead, tasks, onAddNextStep }: NextActionBannerProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const health = computeHealth(lead, tasks)
  const next = nextAction(tasks)
  const today = todayYmd()
  const content = bannerContent(health, {
    nextTitle: next?.title,
    dueYmd: next?.due_date,
    todayYmd: today,
    waitingReason: lead.waiting?.reason,
    waitingFollowUp: lead.waiting?.follow_up_date,
    stageLabel: LEAD_STAGE_LABELS[lead.stage],
  })

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false) }
  }

  const Icon = content.tone === 'active' ? Clock
    : content.tone === 'waiting' ? Clock
    : content.tone === 'attention' ? AlertCircle
    : CheckCircle2

  return (
    <div className={`rounded-lg border p-4 ${TONE[content.tone]}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{content.heading}</p>
            <p className="text-sm text-muted-foreground">{content.detail}</p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {health === 'active' && next && (
            <>
              <Button size="sm" disabled={busy} onClick={() => run(() => completeTask(orgId, lead.id, next.id))}>
                <Check className="mr-1 h-4 w-4" /> Done
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run(() => snoozeTask(orgId, lead.id, next.id, addDays(next.due_date ?? today, 3)))}
              >
                Snooze 3d
              </Button>
            </>
          )}
          {health === 'needs_attention' && (
            <Button size="sm" onClick={onAddNextStep}>
              <PlusCircle className="mr-1 h-4 w-4" /> Add next step
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}
