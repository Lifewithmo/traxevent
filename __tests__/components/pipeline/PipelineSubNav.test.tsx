import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineSubNav } from '@/components/admin/pipeline/PipelineSubNav'
import { PipelineTasksList } from '@/components/admin/pipeline/PipelineTasksList'
import type { Lead, Task } from '@/lib/types'

describe('PipelineSubNav', () => {
  it('links the three sections with their counts and marks the active one', () => {
    render(<PipelineSubNav orgSlug="acme" active="calendar" openCount={10} dueTodayCount={1} />)
    expect(screen.getByRole('link', { name: /Opportunities/ })).toHaveAttribute('href', '/acme/leads')
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Tasks/ })).toHaveAttribute('href', '/acme/leads/tasks')
    expect(screen.getByText('1 due today')).toBeInTheDocument()
  })

  it('omits the due-today badge when nothing is due', () => {
    render(<PipelineSubNav orgSlug="acme" active="opportunities" openCount={3} dueTodayCount={0} />)
    expect(screen.queryByText(/due today/)).not.toBeInTheDocument()
  })
})

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l', name: 'Dana', stage: 'inquiry', created_at: '2026-08-01T00:00:00.000Z', ...over,
})
const task = (over: Partial<Task>): Task => ({
  id: 't', lead_id: 'l', title: 'Call', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
})

describe('PipelineTasksList', () => {
  const today = '2026-08-12'

  it('buckets open tasks by when they are owed, overdue first', () => {
    const l = lead({ title: 'Wedding' })
    render(
      <PipelineTasksList
        orgSlug="acme"
        today={today}
        rows={[
          { lead: l, task: task({ id: 'later', title: 'Later task', due_date: '2026-08-20' }) },
          { lead: l, task: task({ id: 'over', title: 'Overdue task', due_date: '2026-08-01' }) },
          { lead: l, task: task({ id: 'now', title: 'Today task', due_date: '2026-08-12' }) },
          { lead: l, task: task({ id: 'undated', title: 'Someday task' }) },
          { lead: l, task: task({ id: 'done', title: 'Done task', due_date: '2026-08-12', done: true }) },
        ]}
      />
    )
    expect(screen.getByText('Overdue · 1')).toBeInTheDocument()
    expect(screen.getByText('Due today · 1')).toBeInTheDocument()
    expect(screen.getByText('Upcoming · 1')).toBeInTheDocument()
    expect(screen.getByText('No date · 1')).toBeInTheDocument()
    expect(screen.queryByText('Done task')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overdue task' })).toHaveAttribute('href', '/acme/leads/l')
  })

  it('shows an empty state when the pipeline owes nothing', () => {
    render(<PipelineTasksList orgSlug="acme" today={today} rows={[]} />)
    expect(screen.getByText('No open tasks across the pipeline.')).toBeInTheDocument()
  })
})
