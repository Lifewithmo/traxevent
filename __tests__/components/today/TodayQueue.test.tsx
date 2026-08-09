import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn(), snoozeTask: vi.fn() }))
vi.mock('@/actions/leads', () => ({ setLeadWaiting: vi.fn(), clearLeadWaiting: vi.fn() }))

import { completeTask } from '@/actions/tasks'
import { TodayQueue } from '@/components/admin/today/TodayQueue'
import type { TodayData } from '@/lib/today'

const data: TodayData = {
  tiles: { tasksDue: 1, needsAttention: 1, openPipelineValue: 0 },
  dueTasks: [
    { task: { id: 't1', lead_id: 'l1', title: 'Send quote', due_date: '2026-08-01', done: false, created_at: '' }, leadId: 'l1', leadTitle: 'Ann', company: 'Acme', status: 'overdue' },
  ],
  needsAttention: [{ leadId: 'l2', title: 'Bob', stage: 'inquiry' }],
  waiting: [],
  wonUnscheduled: [],
}

beforeEach(() => vi.clearAllMocks())

describe('TodayQueue', () => {
  it('renders group headers with counts and customer-first rows', () => {
    render(<TodayQueue orgId="o1" orgSlug="acme" data={data} />)
    expect(screen.getByText('Overdue · 1')).toBeInTheDocument()
    expect(screen.getByText('No next step · 1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/acme/leads/l1')
    expect(screen.getByText(/Send quote · due 2026-08-01/)).toBeInTheDocument()
  })

  it('marks a task done from the row menu and refreshes', async () => {
    render(<TodayQueue orgId="o1" orgSlug="acme" data={data} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Row actions' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('o1', 'l1', 't1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows the empty state when nothing needs a move', () => {
    render(
      <TodayQueue
        orgId="o1"
        orgSlug="acme"
        data={{ tiles: { tasksDue: 0, needsAttention: 0, openPipelineValue: 0 }, dueTasks: [], needsAttention: [], waiting: [], wonUnscheduled: [] }}
      />
    )
    expect(screen.getByText('Nothing needs a move today.')).toBeInTheDocument()
  })
})
