import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineSubNav } from '@/components/admin/pipeline/PipelineSubNav'
import { PipelineTasksList } from '@/components/admin/pipeline/PipelineTasksList'
import type { Lead, Task } from '@/lib/types'

describe('PipelineSubNav', () => {
  it('links the two sections with their counts and marks the active one', () => {
    render(<PipelineSubNav orgSlug="acme" active="tasks" openCount={10} dueTodayCount={1} />)
    expect(screen.getByRole('link', { name: /Opportunities/ })).toHaveAttribute('href', '/acme/leads')
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tasks/ })).toHaveAttribute('href', '/acme/leads/tasks')
    expect(screen.getByRole('link', { name: /Tasks/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('1 owed')).toBeInTheDocument()
  })

  it('omits the owed badge when nothing is owed', () => {
    render(<PipelineSubNav orgSlug="acme" active="opportunities" openCount={3} dueTodayCount={0} />)
    expect(screen.queryByText(/owed/)).not.toBeInTheDocument()
  })

  // The count fed in is `due_date <= today` — overdue INCLUDED (leads/page.tsx
  // and leads/tasks/page.tsx both compute it that way). Calling it "due today"
  // put the tab in direct contradiction with the tasks page's own "Due today"
  // tile, which counts `=== today`: 4 overdue + 1 due today showed a tab reading
  // "5 due today" above a tile reading "Due today 1".
  it('labels the owed count honestly instead of claiming it is all due today', () => {
    render(<PipelineSubNav orgSlug="acme" active="tasks" openCount={9} dueTodayCount={5} />)
    expect(screen.getByText('5 owed')).toBeInTheDocument()
    expect(screen.queryByText(/due today/i)).not.toBeInTheDocument()
  })

  it('renders only Opportunities and Tasks', () => {
    render(<PipelineSubNav orgSlug="acme" active="opportunities" />)
    expect(screen.getByRole('link', { name: /Opportunities/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tasks/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Calendar' })).not.toBeInTheDocument()
  })

  // Both PipelineListClient and PipelineBoardView createPortal into this node.
  // Two of them (or none) makes their buttons vanish with no error at all.
  it('exposes exactly one portal target for the page actions', () => {
    const { container } = render(<PipelineSubNav orgSlug="acme" active="opportunities" openCount={3} />)
    expect(container.querySelectorAll('#tx-pipeline-actions')).toHaveLength(1)
  })

  it('lets the tab row and the action slot wrap instead of overflowing', () => {
    const { container } = render(<PipelineSubNav orgSlug="acme" active="opportunities" openCount={3} />)
    const row = container.querySelector('#tx-pipeline-actions')!.parentElement!
    expect(row.className).toContain('flex-wrap')
    expect(container.querySelector('#tx-pipeline-actions')!.className).toContain('w-full')
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
  const l = lead({ title: 'Wedding' })
  const fourBuckets = [
    { lead: l, task: task({ id: 'later', title: 'Later task', due_date: '2026-08-20' }) },
    { lead: l, task: task({ id: 'later2', title: 'Even later task', due_date: '2026-08-24' }) },
    { lead: l, task: task({ id: 'over', title: 'Overdue task', due_date: '2026-08-01' }) },
    { lead: l, task: task({ id: 'now', title: 'Today task', due_date: '2026-08-12' }) },
    { lead: l, task: task({ id: 'undated', title: 'Someday task' }) },
    { lead: l, task: task({ id: 'done', title: 'Done task', due_date: '2026-08-12', done: true }) },
  ]

  it('buckets open tasks by when they are owed, overdue first', () => {
    render(<PipelineTasksList orgSlug="acme" today={today} rows={fourBuckets} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('Due today')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.queryByText('Done task')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overdue task' })).toHaveAttribute('href', '/acme/leads/l')
  })

  /*
    DUPLICATE FIGURE. leads/tasks/page.tsx:46-69 renders a KPI band of exactly
    these four counts ~60px above this list, so printing them again as "Overdue
    · 1" group headers put the same four numbers on one screen twice. The band
    is the figure surface; the header names the bucket and nothing else.
  */
  it('carries the bucket label without restating the count the KPI band already shows', () => {
    const { container } = render(<PipelineTasksList orgSlug="acme" today={today} rows={fourBuckets} />)
    const headers = Array.from(container.querySelectorAll('div.font-mono.uppercase'))
    expect(headers.map((h) => h.textContent)).toEqual(['Overdue', 'Due today', 'Upcoming', 'Unscheduled'])
    // Not "Upcoming · 2", and no stray digit anywhere in a header.
    for (const h of headers) expect(h.textContent).not.toMatch(/\d/)
  })

  // The band above calls this bucket "Unscheduled"; the list said "No date" for
  // the identical set of tasks.
  it('names the undated bucket the same thing the KPI tile does', () => {
    render(<PipelineTasksList orgSlug="acme" today={today} rows={fourBuckets} />)
    expect(screen.getByText('Unscheduled')).toBeInTheDocument()
    expect(screen.queryByText(/No date/)).toBeNull()
  })

  /*
    THIRD DATE FORMAT. `due_date.slice(5)` rendered "08-14" in a module whose
    list, board, KPI band, FactsGrid, DatesPanel and NextActionBanner all read
    `Aug 14, 2026`.
  */
  it('renders a due date in the module’s one date format', () => {
    const { container } = render(<PipelineTasksList orgSlug="acme" today={today} rows={fourBuckets} />)
    expect(screen.getByText('Aug 1, 2026')).toBeInTheDocument()
    expect(screen.getByText('Aug 20, 2026')).toBeInTheDocument()
    expect(container.textContent).not.toContain('08-20')
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('shows a kit empty state with one way forward when the pipeline owes nothing', () => {
    const { container } = render(<PipelineTasksList orgSlug="acme" today={today} rows={[]} />)
    expect(container.querySelectorAll('[data-slot="empty-state"]')).toHaveLength(1)
    expect(screen.getByText('No open tasks across the pipeline')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /opportunit/i })).toHaveAttribute('href', '/acme/leads')
  })
})
