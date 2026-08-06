import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const createTask = vi.fn().mockResolvedValue({})
const setLeadWaiting = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({ createTask: (...a: unknown[]) => createTask(...a) }))
vi.mock('@/actions/leads', () => ({ setLeadWaiting: (...a: unknown[]) => setLeadWaiting(...a) }))

import { NeedsAttentionList } from '@/components/admin/today/NeedsAttentionList'
import type { NeedsAttentionItem } from '@/lib/today'

const items: NeedsAttentionItem[] = [{ leadId: 'l1', name: 'Ann', company: 'Acme', stage: 'inquiry' }]

describe('NeedsAttentionList', () => {
  beforeEach(() => { refresh.mockClear(); createTask.mockClear(); setLeadWaiting.mockClear() })

  it('empty state', () => {
    render(<NeedsAttentionList orgId="o1" orgSlug="acme" items={[]} />)
    expect(screen.getByText(/nothing needs attention/i)).toBeInTheDocument()
  })

  it('adds a next step', async () => {
    render(<NeedsAttentionList orgId="o1" orgSlug="acme" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: /add next step/i }))
    fireEvent.change(screen.getByPlaceholderText(/task/i), { target: { value: 'Call Ann' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ title: 'Call Ann' })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('marks waiting', async () => {
    render(<NeedsAttentionList orgId="o1" orgSlug="acme" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: /mark waiting/i }))
    fireEvent.change(screen.getByPlaceholderText(/waiting on/i), { target: { value: 'Client reviewing' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(setLeadWaiting).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ reason: 'Client reviewing' })))
  })
})
