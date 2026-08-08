'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StickyNote, ArrowRightLeft, CheckSquare, Mail, FileText, Sparkles, Clock, Briefcase, XCircle, BellRing } from 'lucide-react'
import { createNote } from '@/actions/notes'
import { formatRelativeTime } from '@/lib/opportunity-detail'
import type { ActivityEvent } from '@/lib/types'

interface ActivityTimelineProps {
  orgId: string
  leadId: string
  activity: ActivityEvent[]
}

const KIND_ICON = {
  note: StickyNote,
  stage: ArrowRightLeft,
  task: CheckSquare,
  email: Mail,
  form: FileText,
  created: Sparkles,
  waiting: Clock,
  converted: Briefcase,
  lost: XCircle,
  nudge: BellRing,
} as const

export function ActivityTimeline({ orgId, leadId, activity }: ActivityTimelineProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAddNote() {
    if (!body.trim()) return
    setBusy(true); setError(null)
    try {
      await createNote(orgId, { parent_type: 'opportunity', parent_id: leadId, body: body.trim() })
      setBody(''); router.refresh()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not add note') }
    finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note…"
            className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleAddNote} disabled={busy || !body.trim()}>Add note</Button>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>

        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((e) => {
              const Icon = KIND_ICON[e.kind] ?? Sparkles
              return (
                <li key={e.id} className="flex gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{e.summary}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(e.created_at)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
