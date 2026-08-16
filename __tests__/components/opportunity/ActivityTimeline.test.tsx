import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const createNote = vi.fn().mockResolvedValue({})
vi.mock('@/actions/notes', () => ({ createNote: (...a: unknown[]) => createNote(...a) }))

import { ActivityTimeline } from '@/components/admin/opportunity/ActivityTimeline'
import type { ActivityEvent } from '@/lib/types'

const events: ActivityEvent[] = [
  { id: 'a1', parent_type: 'opportunity', parent_id: 'l1', kind: 'stage', summary: 'Stage → proposal', created_at: '2026-08-05T10:00:00.000Z' },
]

describe('ActivityTimeline', () => {
  beforeEach(() => { refresh.mockClear(); createNote.mockClear() })

  it('renders events', () => {
    render(<ActivityTimeline orgId="o1" parentType="opportunity" parentId="l1" activity={events} />)
    expect(screen.getByText('Stage → proposal')).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    render(<ActivityTimeline orgId="o1" parentType="opportunity" parentId="l1" activity={[]} />)
    expect(screen.getByText(/no activity/i)).toBeInTheDocument()
  })

  it('adds a note', async () => {
    render(<ActivityTimeline orgId="o1" parentType="opportunity" parentId="l1" activity={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }))
    fireEvent.change(screen.getByPlaceholderText(/add a note/i), { target: { value: 'Talked to client' } })
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))
    await waitFor(() => expect(createNote).toHaveBeenCalledWith('o1', { parent_type: 'opportunity', parent_id: 'l1', body: 'Talked to client' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('keeps the composer hidden until the affordance is used', () => {
    render(<ActivityTimeline orgId="o1" parentType="opportunity" parentId="l1" activity={[]} />)
    expect(screen.queryByPlaceholderText('Add a note…')).not.toBeInTheDocument()
  })

  it('focuses the note textarea when opened', async () => {
    render(<ActivityTimeline orgId="o1" parentType="opportunity" parentId="l1" activity={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }))
    expect(screen.getByPlaceholderText('Add a note…')).toHaveFocus()
  })
})
