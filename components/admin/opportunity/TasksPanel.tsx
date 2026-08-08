'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Circle } from 'lucide-react'
import { createTask, completeTask } from '@/actions/tasks'
import { dueStatus, todayYmd } from '@/lib/opportunity-detail'
import type { Task } from '@/lib/types'

interface TasksPanelProps {
  orgId: string
  leadId: string
  tasks: Task[]
}

export interface TasksPanelHandle {
  openComposer(): void
}

const dueClass: Record<string, string> = {
  overdue: 'text-destructive font-medium',
  today: 'text-amber-600 dark:text-amber-400 font-medium',
  upcoming: 'text-muted-foreground',
}

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

  if (tasks.length === 0 && !composerOpen) {
    return (
      <p className="text-sm text-muted-foreground">
        No tasks — <Button variant="link" className="h-auto p-0" onClick={() => setComposerOpen(true)}>Add a task</Button> to give this deal a next step.
      </p>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tasks</CardTitle></CardHeader>
      <CardContent className="space-y-3">
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
              className="flex-1"
            />
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-40" aria-label="Due date" />
            <Button onClick={handleAdd} disabled={busy || !title.trim()}>Add</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setComposerOpen(true)}>Add a task</Button>
        )}

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {openTasks.length === 0 && doneTasks.length === 0 && !composerOpen && (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        )}

        <ul className="divide-y divide-border">
          {openTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <button
                type="button"
                aria-label={`Complete ${t.title}`}
                onClick={() => handleComplete(t.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Circle className="h-4 w-4" />
              </button>
              <span className="flex-1 text-sm">{t.title}</span>
              {t.due_date && (
                <span className={`text-xs ${dueClass[dueStatus(t.due_date, today)]}`}>{t.due_date}</span>
              )}
            </li>
          ))}
          {doneTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2 text-muted-foreground">
              <span className="text-sm line-through">{t.title}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
})
