import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const completeTask = vi.fn().mockResolvedValue(undefined)
const snoozeTask = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({ completeTask: (...a: unknown[]) => completeTask(...a), snoozeTask: (...a: unknown[]) => snoozeTask(...a) }))
const setLeadWaiting = vi.fn().mockResolvedValue(undefined)
const clearLeadWaiting = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ setLeadWaiting: (...a: unknown[]) => setLeadWaiting(...a), clearLeadWaiting: (...a: unknown[]) => clearLeadWaiting(...a) }))

import { NextActionBanner } from '@/components/admin/opportunity/NextActionBanner'
import type { Lead, Task } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'X', stage: 'proposal', created_at: '' }
const dated: Task = { id: 't1', lead_id: 'l1', title: 'Call venue', due_date: '2026-08-05', done: false, created_at: '' }

describe('NextActionBanner', () => {
  beforeEach(() => { refresh.mockClear(); completeTask.mockClear(); snoozeTask.mockClear() })

  it('active: completes the next action', async () => {
    render(<NextActionBanner orgId="o1" lead={lead} tasks={[dated]} onAddNextStep={vi.fn()} />)
    expect(screen.getByText('Call venue')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('o1', 'l1', 't1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('active: snoozes the next action', async () => {
    render(<NextActionBanner orgId="o1" lead={lead} tasks={[dated]} onAddNextStep={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /snooze/i }))
    await waitFor(() => expect(snoozeTask).toHaveBeenCalledWith('o1', 'l1', 't1', '2026-08-08'))
  })

  it('active: re-enables the Done button after a successful action settles', async () => {
    render(<NextActionBanner orgId="o1" lead={lead} tasks={[dated]} onAddNextStep={vi.fn()} />)
    const doneButton = screen.getByRole('button', { name: /done/i })
    fireEvent.click(doneButton)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await waitFor(() => expect(doneButton).toBeEnabled())
  })

  it('needs attention: prompts to add a next step', () => {
    const onAdd = vi.fn()
    render(<NextActionBanner orgId="o1" lead={lead} tasks={[]} onAddNextStep={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add next step/i }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('needs attention: parking the deal opens a real dialog', () => {
    render(<NextActionBanner orgId="o1" lead={lead} tasks={[]} onAddNextStep={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark as waiting' }))
    expect(screen.getByRole('dialog', { name: 'Mark as waiting' })).toBeInTheDocument()
  })

  it('waiting: paints from the pending status tokens, not a raw amber literal', () => {
    const { container } = render(
      <NextActionBanner
        orgId="o1"
        lead={{ ...lead, waiting: { reason: 'Client reviewing' } }}
        tasks={[]}
        onAddNextStep={vi.fn()}
      />
    )
    const banner = container.querySelector('[data-slot="next-action-banner"]')!
    expect(banner.className).toContain('bg-[var(--status-pending-bg)]')
    expect(banner.className).not.toMatch(/amber/)
  })

  it('closed: shows the outcome and no actions', () => {
    render(<NextActionBanner orgId="o1" lead={{ ...lead, stage: 'closed_won' }} tasks={[]} onAddNextStep={vi.fn()} />)
    expect(screen.getByText('Closed Won')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /done/i })).not.toBeInTheDocument()
  })
})
