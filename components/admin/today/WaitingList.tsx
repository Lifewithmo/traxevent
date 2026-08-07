'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createTask } from '@/actions/tasks'
import { setLeadWaiting, clearLeadWaiting } from '@/actions/leads'
import { addDays, todayYmd } from '@/lib/opportunity-detail'
import type { WaitingItem } from '@/lib/today'

function Row({ orgId, orgSlug, item }: { orgId: string; orgSlug: string; item: WaitingItem }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayYmd()

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false) }
  }

  return (
    <div className={`rounded-md border px-3 py-2 ${item.followUpDue ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-border'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/${orgSlug}/leads/${item.leadId}`} className="hover:underline">
            <span className="text-sm font-medium">{item.title}</span>
            {item.company && <span className="ml-2 text-xs text-muted-foreground">{item.company}</span>}
          </Link>
          <p className="text-xs text-muted-foreground">{item.reason} · quiet {item.quietDays}d</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {item.followUpDue && (
            <>
              <Button size="sm" disabled={busy} onClick={() => run(() => createTask(orgId, item.leadId, { title: `Follow up: ${item.reason}`, due_date: today }))}>Follow up now</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => setLeadWaiting(orgId, item.leadId, { reason: item.reason, follow_up_date: addDays(today, 3) }))}>Still waiting</Button>
            </>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => clearLeadWaiting(orgId, item.leadId))}>Resume</Button>
        </div>
      </div>
      {error && <p className="mt-1 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}

interface WaitingListProps {
  orgId: string
  orgSlug: string
  items: WaitingItem[]
}

export function WaitingList({ orgId, orgSlug, items }: WaitingListProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Waiting on</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0
          ? <p className="text-sm text-muted-foreground">No one is waiting.</p>
          : items.map((it) => <Row key={it.leadId} orgId={orgId} orgSlug={orgSlug} item={it} />)}
      </CardContent>
    </Card>
  )
}
