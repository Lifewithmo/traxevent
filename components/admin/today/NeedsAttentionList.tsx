'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createTask } from '@/actions/tasks'
import { setLeadWaiting } from '@/actions/leads'
import type { NeedsAttentionItem } from '@/lib/today'

type Mode = 'idle' | 'task' | 'waiting'

function Row({ orgId, orgSlug, item }: { orgId: string; orgSlug: string; item: NeedsAttentionItem }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('idle')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [reason, setReason] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); setMode('idle'); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/${orgSlug}/leads/${item.leadId}`} className="min-w-0 flex-1 hover:underline">
          <span className="text-sm font-medium">{item.name}</span>
          {item.company && <span className="ml-2 text-xs text-muted-foreground">{item.company}</span>}
        </Link>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode(mode === 'task' ? 'idle' : 'task')}>Add next step</Button>
          <Button size="sm" variant="outline" onClick={() => setMode(mode === 'waiting' ? 'idle' : 'waiting')}>Mark waiting</Button>
        </div>
      </div>

      {mode === 'task' && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Next task…" className="flex-1" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-40" aria-label="Due date" />
          <Button size="sm" disabled={busy || !title.trim()} onClick={() => run(() => createTask(orgId, item.leadId, { title: title.trim(), ...(due ? { due_date: due } : {}) }))}>Add</Button>
        </div>
      )}

      {mode === 'waiting' && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Waiting on…" className="flex-1" />
          <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="sm:w-40" aria-label="Follow-up date" />
          <Button size="sm" disabled={busy || !reason.trim()} onClick={() => run(() => setLeadWaiting(orgId, item.leadId, { reason: reason.trim(), ...(followUp ? { follow_up_date: followUp } : {}) }))}>Save</Button>
        </div>
      )}

      {error && <p className="mt-1 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}

interface NeedsAttentionListProps {
  orgId: string
  orgSlug: string
  items: NeedsAttentionItem[]
}

export function NeedsAttentionList({ orgId, orgSlug, items }: NeedsAttentionListProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Needs attention</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0
          ? <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
          : items.map((it) => <Row key={it.leadId} orgId={orgId} orgSlug={orgSlug} item={it} />)}
      </CardContent>
    </Card>
  )
}
