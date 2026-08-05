import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
const deleteLead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ deleteLead: (...a: unknown[]) => deleteLead(...a), updateLead: vi.fn() }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn(), snoozeTask: vi.fn() }))
vi.mock('@/actions/notes', () => ({ createNote: vi.fn() }))

import { OpportunityDetailClient } from '@/components/admin/OpportunityDetailClient'
import type { Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Ada Wedding', stage: 'proposal', created_at: '' }

describe('OpportunityDetailClient', () => {
  beforeEach(() => { push.mockClear(); deleteLead.mockClear() })

  it('renders header, banner, tasks and activity', () => {
    render(<OpportunityDetailClient orgId="o1" orgSlug="acme" lead={lead} customer={null} tasks={[]} activity={[]} />)
    expect(screen.getByRole('heading', { name: 'Ada Wedding' })).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    // needs_attention banner CTA present (no tasks, open stage)
    expect(screen.getByRole('button', { name: /add next step/i })).toBeInTheDocument()
  })

  it('deletes after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<OpportunityDetailClient orgId="o1" orgSlug="acme" lead={lead} customer={null} tasks={[]} activity={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(deleteLead).toHaveBeenCalledWith('o1', 'l1'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/acme/leads'))
  })
})
