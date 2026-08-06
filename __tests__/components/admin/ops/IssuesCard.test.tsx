import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  createIssue: vi.fn().mockImplementation(async (_o: string, _e: string, input: object) => ({
    id: 'i-new', status: 'open', created_by: 'u1', created_at: '2026-08-05T00:00:00.000Z', ...input,
  })),
  resolveIssue: vi.fn().mockResolvedValue(undefined),
}))

import { createIssue, resolveIssue } from '@/actions/event-ops'
import { IssuesCard } from '@/components/admin/ops/IssuesCard'
import type { OpsIssue } from '@/lib/types'

const open: OpsIssue = {
  id: 'i1', type: 'equipment', severity: 'high', note: 'Grinder burrs cracked',
  status: 'open', created_by: 'u1', created_at: '2026-08-05T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('IssuesCard', () => {
  it('lists open issues with severity', () => {
    render(<IssuesCard orgId="o1" eventId="e1" issues={[open]} />)
    expect(screen.getByText('Grinder burrs cracked')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('creates an issue', async () => {
    render(<IssuesCard orgId="o1" eventId="e1" issues={[]} />)
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'supply' } })
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'medium' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Out of oat milk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log issue' }))
    await waitFor(() => expect(createIssue).toHaveBeenCalledWith('o1', 'e1', {
      type: 'supply', severity: 'medium', note: 'Out of oat milk',
    }))
    expect(await screen.findByText('Out of oat milk')).toBeInTheDocument()
  })

  it('resolves an issue with a resolution note', async () => {
    render(<IssuesCard orgId="o1" eventId="e1" issues={[open]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    fireEvent.change(screen.getByLabelText('Resolution'), { target: { value: 'Swapped to backup grinder' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }))
    await waitFor(() => expect(resolveIssue).toHaveBeenCalledWith('o1', 'e1', 'i1', 'Swapped to backup grinder'))
    expect(screen.getByText(/resolved/i)).toBeInTheDocument()
  })
})
