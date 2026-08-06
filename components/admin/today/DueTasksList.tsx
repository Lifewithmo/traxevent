'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { completeTask, snoozeTask } from '@/actions/tasks'
import { addDays, todayYmd } from '@/lib/opportunity-detail'
import type { DueTaskItem } from '@/lib/today'

function Row({ orgId, orgSlug, item }: { orgId: string; orgSlug: string; item: DueTaskItem }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayYmd()

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.task.title}</p>
          <Link href={`/${orgSlug}/leads/${item.leadId}`} className="text-xs text-muted-foreground hover:underline">
            {item.leadName}{item.company ? ` · ${item.company}` : ''}
          </Link>
        </div>
        <span className={`shrink-0 text-xs font-medium ${item.status === 'overdue' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
          {item.status === 'overdue' ? 'Overdue' : 'Today'}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" disabled={busy} onClick={() => run(() => completeTask(orgId, item.leadId, item.task.id))}>Done</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => snoozeTask(orgId, item.leadId, item.task.id, addDays(item.task.due_date ?? today, 3)))}>Snooze</Button>
        </div>
      </div>
      {error && <p className="mt-1 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}

interface DueTasksListProps {
  orgId: string
  orgSlug: string
  items: DueTaskItem[]
}

export function DueTasksList({ orgId, orgSlug, items }: DueTasksListProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Due today / overdue</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0
          ? <p className="text-sm text-muted-foreground">Nothing due.</p>
          : items.map((it) => <Row key={it.task.id} orgId={orgId} orgSlug={orgSlug} item={it} />)}
      </CardContent>
    </Card>
  )
}
