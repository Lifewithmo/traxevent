'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { completeTask, createTask, snoozeTask } from '@/actions/tasks'
import { setLeadWaiting, clearLeadWaiting } from '@/actions/leads'
import { addDays, todayYmd } from '@/lib/opportunity-detail'
import { buildMoves, moveCount, type Move, type MoveAction, type MoveGroupBlock } from '@/lib/today-moves'
import type { TodayData } from '@/lib/today'

interface TodayQueueProps {
  orgId: string
  orgSlug: string
  data: TodayData
}

function GroupHeader({ block }: { block: MoveGroupBlock }) {
  const urgent = block.tone === 'urgent'
  return (
    <div
      className={[
        'border-y px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
        urgent ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-border bg-muted text-muted-foreground',
      ].join(' ')}
    >
      {block.label} · {block.moves.length}
    </div>
  )
}

function ActionMenu({
  move,
  orgId,
  orgSlug,
  onRan,
}: {
  move: Move
  orgId: string
  orgSlug: string
  onRan: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const today = todayYmd()

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function run(action: MoveAction) {
    if (action.kind === 'open') return
    setBusy(true)
    setError(null)
    try {
      switch (action.kind) {
        case 'complete':
          if (move.taskId) await completeTask(orgId, move.leadId, move.taskId)
          break
        case 'set_due':
          if (move.taskId && action.dueDate) await snoozeTask(orgId, move.leadId, move.taskId, action.dueDate)
          break
        case 'create_task':
          await createTask(orgId, move.leadId, { title: 'Next step', due_date: today })
          break
        case 'still_waiting':
          await setLeadWaiting(orgId, move.leadId, {
            reason: move.detail,
            follow_up_date: addDays(today, 3),
          })
          break
        case 'resume':
          await clearLeadWaiting(orgId, move.leadId)
          break
        case 'schedule':
          router.push(`/${orgSlug}/new-event?leadId=${move.leadId}`)
          return
      }
      setOpen(false)
      onRan()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-label="Row actions"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex h-[22px] w-[22px] items-center justify-center rounded border text-[9px] transition-colors',
          open ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted',
        ].join(' ')}
      >
        ▾
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-48 rounded-md border border-border bg-background p-1 text-xs shadow-lg">
          {move.actions.map((a, i) =>
            a.kind === 'open' ? (
              <Link
                key={a.label}
                href={`/${orgSlug}/leads/${move.leadId}`}
                className="mt-1 block rounded px-2.5 py-1.5 text-muted-foreground hover:bg-muted"
              >
                {a.label}
              </Link>
            ) : a.kind === 'pick_date' ? (
              <label key={a.label} className="block rounded px-2.5 py-1.5 hover:bg-muted">
                <span>{a.label}</span>
                <input
                  type="date"
                  defaultValue={move.dueDate ?? today}
                  className="mt-1 w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
                  onChange={(e) => e.target.value && run({ kind: 'set_due', label: 'Due', dueDate: e.target.value })}
                />
              </label>
            ) : (
              <button
                key={a.label}
                type="button"
                disabled={busy}
                onClick={() => run(a)}
                className={[
                  'block w-full rounded px-2.5 py-1.5 text-left hover:bg-muted',
                  i === 0 ? 'bg-muted font-semibold' : '',
                ].join(' ')}
              >
                {a.label}
              </button>
            )
          )}
          {error && (
            <p className="px-2.5 py-1.5 text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ move, orgId, orgSlug, onRan }: { move: Move; orgId: string; orgSlug: string; onRan: () => void }) {
  const urgent = move.group === 'overdue'
  return (
    <div
      className={[
        'flex items-center gap-3 border-b border-border/60 px-5 py-2.5',
        urgent ? 'border-l-2 border-l-destructive' : '',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <Link href={`/${orgSlug}/leads/${move.leadId}`} className="text-sm font-semibold hover:underline">
          {move.customer}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{move.detail}</p>
      </div>
      <ActionMenu move={move} orgId={orgId} orgSlug={orgSlug} onRan={onRan} />
    </div>
  )
}

export function TodayQueue({ orgId, orgSlug, data }: TodayQueueProps) {
  const router = useRouter()
  const blocks = buildMoves(data, todayYmd())

  if (moveCount(blocks) === 0) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">Nothing needs a move today.</p>
  }

  return (
    <div>
      {blocks.map((block) => (
        <div key={block.group}>
          <GroupHeader block={block} />
          {block.moves.map((m) => (
            <Row key={m.key} move={m} orgId={orgId} orgSlug={orgSlug} onRan={() => router.refresh()} />
          ))}
        </div>
      ))}
    </div>
  )
}
