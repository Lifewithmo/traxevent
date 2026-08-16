'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { StatusPill } from '@/components/ui/status-pill'
import { Circle, ListChecks } from 'lucide-react'
import { createTask, completeTask } from '@/actions/tasks'
import { dueStatus, todayYmd } from '@/lib/opportunity-detail'
import { shortDate } from '@/lib/pipeline-presentation'
import type { DueStatus } from '@/lib/opportunity-detail'
import type { Task } from '@/lib/types'

interface TasksPanelProps {
  orgId: string
  leadId: string
  tasks: Task[]
}

export interface TasksPanelHandle {
  openComposer(): void
}

/**
 * Inline tone for a due date, keyed by the same `DueStatus` union DUE_TONE is.
 *
 * Deliberately NOT `StatusPill tone={DUE_TONE[...]}`: a filled pill on every row
 * of a compact list out-shouts the task title it is annotating, and the module
 * already settled on toned text for a row-level due date (PipelineTasksList.tsx:90).
 * Pills are reserved here for the header counts, which ARE the status.
 *
 * `today` reads the shared pending token rather than the `text-amber-600
 * dark:text-amber-400` literal it replaced — one token, no `dark:` variant,
 * because the status tokens carry their own dark values (app/globals.css:247).
 */
const DUE_CLASS: Record<DueStatus, string> = {
  overdue: 'text-destructive font-medium',
  today: 'text-[var(--status-pending-fg)] font-medium',
  upcoming: 'text-muted-foreground',
}

/**
 * The queued work on this opportunity, and the one control that adds to it.
 *
 * R2: `openTaskCount` / `overdueTaskCount` are computed by `opportunityRollup`
 * and rendered by no surface in the module — the KPI band spends its four tiles
 * on money and dates. The counts land here, beside the section they describe,
 * rather than as a fifth tile: they qualify this list, and a tile would put the
 * same figure on the page twice the moment anyone promoted them upstream.
 */
export const TasksPanel = forwardRef<TasksPanelHandle, TasksPanelProps>(function TasksPanel(
  { orgId, leadId, tasks },
  ref
) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const today = todayYmd()

  const openTasks = tasks.filter((t) => !t.done)
  const doneTasks = tasks.filter((t) => t.done)
  const overdueCount = openTasks.filter((t) => t.due_date != null && t.due_date < today).length

  useImperativeHandle(ref, () => ({
    openComposer: () => {
      // Composer already open: setComposerOpen(true) would be a no-op state update, which
      // skips the focus effect below — focus the input directly in that case.
      if (composerOpen) inputRef.current?.focus()
      else setComposerOpen(true)
    },
  }))

  useEffect(() => {
    if (composerOpen) inputRef.current?.focus()
  }, [composerOpen])

  async function handleAdd() {
    if (!title.trim()) return
    setBusy(true); setError(null)
    try {
      await createTask(orgId, leadId, { title: title.trim(), ...(due ? { due_date: due } : {}) })
      setTitle(''); setDue(''); router.refresh()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not add task') }
    finally { setBusy(false) }
  }

  async function handleComplete(id: string) {
    setError(null)
    try { await completeTask(orgId, leadId, id); router.refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not complete task') }
  }

  /**
   * ONE empty state, replacing the two this panel used to carry: a bare `<p>`
   * with an inline link-button that rendered INSTEAD of the card, and a
   * CTA-less "No tasks yet." inside it. Two empties for one condition meant the
   * operator saw a different screen depending on which branch won.
   *
   * The title is exactly "No tasks" and the description does not restate it:
   * OpportunityDetailClient.test.tsx pins `getByText(/No tasks/)`, which throws
   * on a second match.
   */
  const showEmpty = tasks.length === 0 && !composerOpen

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tasks</CardTitle>
        {openTasks.length > 0 && (
          <CardAction className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{openTasks.length} open</span>
            {overdueCount > 0 && (
              <StatusPill tone="alert" className="tabular-nums">{overdueCount} overdue</StatusPill>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {showEmpty ? (
          <EmptyState
            icon={<ListChecks className="size-4" />}
            title="No tasks"
            description="Give this deal a next step so it never rots."
            action={
              <Button size="sm" onClick={() => setComposerOpen(true)}>
                Add a task
              </Button>
            }
          />
        ) : (
          <>
            {composerOpen ? (
              <div
                className="flex flex-col gap-2 sm:flex-row"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node) && !title.trim() && !due) setComposerOpen(false)
                }}
              >
                <Input
                  ref={inputRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                  placeholder="Add a task…"
                  className="min-w-0 flex-1"
                />
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="tabular-nums sm:w-40" aria-label="Due date" />
                <Button onClick={handleAdd} disabled={busy || !title.trim()}>Add</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setComposerOpen(true)}>Add a task</Button>
            )}

            <ul className="divide-y divide-border">
              {openTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    aria-label={`Complete ${t.title}`}
                    onClick={() => handleComplete(t.id)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Circle className="h-4 w-4" />
                  </button>
                  <span className="min-w-0 flex-1 text-sm break-words">{t.title}</span>
                  {t.due_date && (
                    <span
                      data-testid="task-due"
                      className={`shrink-0 text-xs tabular-nums ${DUE_CLASS[dueStatus(t.due_date, today)]}`}
                    >
                      {shortDate(t.due_date)}
                    </span>
                  )}
                </li>
              ))}
              {doneTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2 text-muted-foreground">
                  <span className="min-w-0 text-sm break-words line-through">{t.title}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </CardContent>
    </Card>
  )
})
