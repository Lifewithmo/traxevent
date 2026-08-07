import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn(), snoozeTask: vi.fn() }))
vi.mock('@/actions/leads', () => ({ setLeadWaiting: vi.fn(), clearLeadWaiting: vi.fn() }))

import { TodayClient } from '@/components/admin/today/TodayClient'
import type { TodayData } from '@/lib/today'

const data: TodayData = {
  tiles: { tasksDue: 1, needsAttention: 1, openPipelineValue: 500 },
  needsAttention: [{ leadId: 'l1', title: 'Ann', stage: 'inquiry' }],
  dueTasks: [{ task: { id: 't1', lead_id: 'l1', title: 'Call', due_date: '2026-08-05', done: false, created_at: '' }, leadId: 'l1', leadTitle: 'Ann', status: 'today' }],
  waiting: [],
  wonUnscheduled: [],
}

describe('TodayClient', () => {
  it('renders the three sections and tiles', () => {
    render(<TodayClient orgId="o1" orgSlug="acme" data={data} />)
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByText('$500')).toBeInTheDocument()
    expect(screen.getAllByText('Needs attention')).toHaveLength(2)
    expect(screen.getByText('Due today / overdue')).toBeInTheDocument()
    expect(screen.getByText('Waiting on')).toBeInTheDocument()
    expect(screen.getByText('Call')).toBeInTheDocument()
  })

  it('mounts the won-unscheduled list', () => {
    render(<TodayClient orgId="o1" orgSlug="acme" data={data} />)
    expect(screen.getByText('Won, not scheduled')).toBeInTheDocument()
  })
})
