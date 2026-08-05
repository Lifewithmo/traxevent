import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const createTask = vi.fn().mockResolvedValue({})
const completeTask = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({
  createTask: (...a: unknown[]) => createTask(...a),
  completeTask: (...a: unknown[]) => completeTask(...a),
}))

import { TasksPanel } from '@/components/admin/opportunity/TasksPanel'
import type { Task } from '@/lib/types'

const open: Task = { id: 't1', lead_id: 'l1', title: 'Email client', done: false, created_at: '' }
const done: Task = { id: 't2', lead_id: 'l1', title: 'Old task', done: true, created_at: '' }

describe('TasksPanel', () => {
  beforeEach(() => { refresh.mockClear(); createTask.mockClear(); completeTask.mockClear() })

  it('lists tasks', () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[open, done]} />)
    expect(screen.getByText('Email client')).toBeInTheDocument()
    expect(screen.getByText('Old task')).toBeInTheDocument()
  })

  it('adds a task', async () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[]} />)
    fireEvent.change(screen.getByPlaceholderText(/add a task/i), { target: { value: 'Call caterer' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(createTask).toHaveBeenCalledWith('o1', 'l1', expect.objectContaining({ title: 'Call caterer' })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('completes a task', async () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[open]} />)
    fireEvent.click(screen.getByRole('button', { name: /complete/i }))
    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('o1', 'l1', 't1'))
  })
})
