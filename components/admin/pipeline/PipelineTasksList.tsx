import Link from 'next/link'
import { opportunityTitle } from '@/lib/leads'
import type { Lead, Task } from '@/lib/types'

interface PipelineTasksListProps {
  orgSlug: string
  today: string
  rows: Array<{ lead: Lead; task: Task }>
}

type Bucket = 'overdue' | 'due_today' | 'upcoming' | 'no_date'

const BUCKET_META: Record<Bucket, { label: string; tone: 'urgent' | 'normal' }> = {
  overdue: { label: 'Overdue', tone: 'urgent' },
  due_today: { label: 'Due today', tone: 'normal' },
  upcoming: { label: 'Upcoming', tone: 'normal' },
  no_date: { label: 'No date', tone: 'normal' },
}

const BUCKET_ORDER: Bucket[] = ['overdue', 'due_today', 'upcoming', 'no_date']

function bucketOf(task: Task, today: string): Bucket {
  if (!task.due_date) return 'no_date'
  if (task.due_date < today) return 'overdue'
  if (task.due_date === today) return 'due_today'
  return 'upcoming'
}

/** Every open task across the pipeline, grouped by when it's owed. */
export function PipelineTasksList({ orgSlug, today, rows }: PipelineTasksListProps) {
  const open = rows.filter((r) => !r.task.done)
  const byDue = (a: { task: Task }, b: { task: Task }) => (a.task.due_date ?? '9999').localeCompare(b.task.due_date ?? '9999')

  const blocks = BUCKET_ORDER.map((bucket) => ({
    bucket,
    ...BUCKET_META[bucket],
    rows: open.filter((r) => bucketOf(r.task, today) === bucket).sort(byDue),
  })).filter((b) => b.rows.length > 0)

  if (blocks.length === 0) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">No open tasks across the pipeline.</p>
  }

  return (
    <div>
      {blocks.map((block) => (
        <div key={block.bucket}>
          <div
            className={[
              'border-y px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
              block.tone === 'urgent'
                ? 'border-destructive/25 bg-destructive/5 text-destructive'
                : 'border-border bg-muted text-muted-foreground',
            ].join(' ')}
          >
            {block.label} · {block.rows.length}
          </div>
          {block.rows.map(({ lead, task }) => (
            <div
              key={task.id}
              className={[
                'flex items-center gap-3 border-b border-border/60 px-5 py-2.5',
                block.tone === 'urgent' ? 'border-l-2 border-l-destructive' : '',
              ].join(' ')}
            >
              <div className="min-w-0 flex-1">
                <Link href={`/${orgSlug}/leads/${lead.id}`} className="text-sm font-semibold hover:underline">
                  {task.title}
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{opportunityTitle(lead)}</p>
              </div>
              {task.due_date && (
                <span className={`shrink-0 font-mono text-xs ${block.bucket === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {task.due_date.slice(5)}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
