'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Inbox } from 'lucide-react'
import { completeTask, createTask, snoozeTask } from '@/actions/tasks'
import { setLeadWaiting, clearLeadWaiting } from '@/actions/leads'
import { addDays, todayYmd } from '@/lib/opportunity-detail'
import { buildMoves, moveCount, type Move, type MoveAction, type MoveGroupBlock } from '@/lib/today-moves'
import type { TodayData } from '@/lib/today'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import { EmptyState } from '@/components/ui/empty-state'

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
  const today = todayYmd()

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
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Row actions" disabled={busy} />}>
        <MoreHorizontal />
      </MenuTrigger>
      <MenuContent>
        {move.actions.map((a, i) =>
          a.kind === 'open' ? (
            <MenuItem key={a.label} render={<Link href={`/${orgSlug}/leads/${move.leadId}`} />}>
              {a.label}
            </MenuItem>
          ) : a.kind === 'pick_date' ? (
            // Plain child, not a MenuItem: MenuItem's div + closeOnClick + typeahead
            // fights a native date input.
            <label key={a.label} className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <span>{a.label}</span>
              <input
                type="date"
                defaultValue={move.dueDate ?? today}
                className="mt-1 w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
                onChange={(e) => e.target.value && run({ kind: 'set_due', label: 'Due', dueDate: e.target.value })}
              />
            </label>
          ) : (
            <MenuItem
              key={a.label}
              closeOnClick={false}
              disabled={busy}
              onClick={() => run(a)}
              className={i === 0 ? 'font-semibold' : undefined}
            >
              {a.label}
            </MenuItem>
          )
        )}
        {error && (
          <p className="px-2.5 py-1.5 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </MenuContent>
    </Menu>
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
      <Avatar name={move.customer} size="sm" />
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
    return (
      <EmptyState
        icon={<Inbox />}
        title="Nothing needs a move today."
        description="Once a lead needs a next step, it'll show up here."
        action={
          <Button variant="outline" size="sm" render={<Link href={`/${orgSlug}/leads`} />}>
            View pipeline
          </Button>
        }
      />
    )
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
