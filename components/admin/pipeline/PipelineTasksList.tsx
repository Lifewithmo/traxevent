import Link from 'next/link'
import { CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { opportunityTitle } from '@/lib/leads'
import { shortDate } from '@/lib/pipeline-presentation'
import type { Lead, Task } from '@/lib/types'

interface PipelineTasksListProps {
  orgSlug: string
  today: string
  rows: Array<{ lead: Lead; task: Task }>
}

type Bucket = 'overdue' | 'due_today' | 'upcoming' | 'no_date'

/**
 * Labels match the KPI band's four tiles on leads/tasks/page.tsx one-for-one,
 * INCLUDING "Unscheduled" (this map said "No date" while the tile above it said
 * "Unscheduled" — same set of tasks, two names).
 */
const BUCKET_META: Record<Bucket, { label: string; tone: 'urgent' | 'normal' }> = {
  overdue: { label: 'Overdue', tone: 'urgent' },
  due_today: { label: 'Due today', tone: 'normal' },
  upcoming: { label: 'Upcoming', tone: 'normal' },
  no_date: { label: 'Unscheduled', tone: 'normal' },
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

  // R4: an empty queue is a place to leave, not a sentence to read — the one CTA
  // sends the operator back to the opportunities that actually owe work.
  if (blocks.length === 0) {
    return (
      <EmptyState
        className="py-12"
        icon={<CheckCheck className="size-4" />}
        title="No open tasks across the pipeline"
        description="Tasks you add on an opportunity land here, bucketed by when they are owed."
        action={
          <Button variant="outline" size="sm" render={<Link href={`/${orgSlug}/leads`} />}>
            Go to opportunities
          </Button>
        }
      />
    )
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
            {/*
              LABEL ONLY. The KPI band ~60px above this on leads/tasks/page.tsx
              is the figure surface and already states all four of these counts;
              repeating them here printed the same four numbers twice on one
              screen. The header's job is to say which bucket the rows below
              belong to.
            */}
            {block.label}
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
                // `shortDate`, not `slice(5)`: "08-14" was a THIRD date format
                // in a module whose list, board, KPI band, facts grid and dates
                // panel all render `Aug 14, 2026`.
                <span className={`shrink-0 font-mono text-xs ${block.bucket === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {shortDate(task.due_date)}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
