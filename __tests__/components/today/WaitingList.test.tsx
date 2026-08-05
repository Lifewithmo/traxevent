import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const createTask = vi.fn().mockResolvedValue({})
const setLeadWaiting = vi.fn().mockResolvedValue(undefined)
const clearLeadWaiting = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({ createTask: (...a: unknown[]) => createTask(...a) }))
vi.mock('@/actions/leads', () => ({
  setLeadWaiting: (...a: unknown[]) => setLeadWaiting(...a),
  clearLeadWaiting: (...a: unknown[]) => clearLeadWaiting(...a),
}))

import { WaitingList } from '@/components/admin/today/WaitingList'
import type { WaitingItem } from '@/lib/today'

const due: WaitingItem = { leadId: 'l1', name: 'Ann', company: 'Acme', reason: 'Client reviewing', followUpDate: '2026-08-03', followUpDue: true, quietDays: 4 }
const notDue: WaitingItem = { leadId: 'l2', name: 'Bob', reason: 'Awaiting deposit', followUpDate: '2026-09-01', followUpDue: false, quietDays: 1 }

describe('WaitingList', () => {
  beforeEach(() => { refresh.mockClear(); createTask.mockClear(); setLeadWaiting.mockClear(); clearLeadWaiting.mockClear() })

  it('empty state', () => {
    render(<WaitingList orgId="o1" orgSlug="acme" items={[]} />)
    expect(screen.getByText(/no one is waiting/i)).toBeInTheDocument()
  })

  it('follow-up-due row offers follow-up now', async () => {
    render(<WaitingList orgId="o1" orgSlug="acme" items={[due]} />)
    fireEvent.click(screen.getByRole('button', { name: /follow up now/i }))
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ title: expect.stringContaining('Follow up') })))
  })

  it('non-due row offers resume only', async () => {
    render(<WaitingList orgId="o1" orgSlug="acme" items={[notDue]} />)
    expect(screen.queryByRole('button', { name: /follow up now/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /resume/i }))
    await waitFor(() => expect(clearLeadWaiting).toHaveBeenCalledWith('o1', 'l2'))
  })
})
