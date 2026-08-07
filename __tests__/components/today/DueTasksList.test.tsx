import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const completeTask = vi.fn().mockResolvedValue(undefined)
const snoozeTask = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({
  completeTask: (...a: unknown[]) => completeTask(...a),
  snoozeTask: (...a: unknown[]) => snoozeTask(...a),
}))

import { DueTasksList } from '@/components/admin/today/DueTasksList'
import type { DueTaskItem } from '@/lib/today'

const items: DueTaskItem[] = [{
  task: { id: 't1', lead_id: 'l1', title: 'Call venue', due_date: '2026-08-01', done: false, created_at: '' },
  leadId: 'l1', leadTitle: 'Ann', company: 'Acme', status: 'overdue',
}]

describe('DueTasksList', () => {
  beforeEach(() => { refresh.mockClear(); completeTask.mockClear(); snoozeTask.mockClear() })

  it('empty state', () => {
    render(<DueTasksList orgId="o1" orgSlug="acme" items={[]} />)
    expect(screen.getByText(/nothing due/i)).toBeInTheDocument()
  })

  it('renders the opportunity title', () => {
    const withTitle: DueTaskItem[] = [{
      task: { id: 't1', lead_id: 'l1', title: 'Call venue', due_date: '2026-08-01', done: false, created_at: '' },
      leadId: 'l1', leadTitle: 'Riverside gala', company: 'Acme', status: 'overdue',
    }]
    render(<DueTasksList orgId="o1" orgSlug="acme" items={withTitle} />)
    expect(screen.getByText(/Riverside gala/)).toBeInTheDocument()
  })

  it('renders and completes', async () => {
    render(<DueTasksList orgId="o1" orgSlug="acme" items={items} />)
    expect(screen.getByText('Call venue')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('o1', 'l1', 't1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('snoozes 3 days from the due date', async () => {
    render(<DueTasksList orgId="o1" orgSlug="acme" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: /snooze/i }))
    await waitFor(() => expect(snoozeTask).toHaveBeenCalledWith('o1', 'l1', 't1', '2026-08-04'))
  })
})
