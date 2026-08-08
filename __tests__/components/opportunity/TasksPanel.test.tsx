import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const createTask = vi.fn().mockResolvedValue({})
const completeTask = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/tasks', () => ({
  createTask: (...a: unknown[]) => createTask(...a),
  completeTask: (...a: unknown[]) => completeTask(...a),
}))

import { TasksPanel, type TasksPanelHandle } from '@/components/admin/opportunity/TasksPanel'
import type { Task } from '@/lib/types'

const open: Task = { id: 't1', lead_id: 'l1', title: 'Email client', done: false, created_at: '' }
const done: Task = { id: 't2', lead_id: 'l1', title: 'Old task', done: true, created_at: '' }

const task = (over: Partial<Task>): Task => ({
  id: 't1', lead_id: 'l1', title: 'Site visit', done: false, created_at: '2026-08-01T00:00:00.000Z', ...over,
} as Task)

describe('TasksPanel', () => {
  beforeEach(() => { refresh.mockClear(); createTask.mockClear(); completeTask.mockClear() })

  it('lists tasks', () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[open, done]} />)
    expect(screen.getByText('Email client')).toBeInTheDocument()
    expect(screen.getByText('Old task')).toBeInTheDocument()
  })

  it('adds a task', async () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }))
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

describe('TasksPanel composer', () => {
  it('renders a one-line empty state with an inline action when there are no tasks', () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[]} />)
    expect(screen.getByText(/No tasks/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a task…')).not.toBeInTheDocument()
  })
  it('opens the composer on demand and focuses the input', async () => {
    const user = userEvent.setup()
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[task({})]} />)
    expect(screen.queryByPlaceholderText('Add a task…')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a task' }))
    expect(screen.getByPlaceholderText('Add a task…')).toHaveFocus()
  })
  it('opens the composer via the imperative handle', () => {
    const ref = createRef<TasksPanelHandle>()
    render(<TasksPanel ref={ref} orgId="o1" leadId="l1" tasks={[]} />)
    act(() => { ref.current!.openComposer() })
    expect(screen.getByPlaceholderText('Add a task…')).toBeInTheDocument()
  })
  it('does not co-render "No tasks yet." with the open composer', () => {
    const ref = createRef<TasksPanelHandle>()
    render(<TasksPanel ref={ref} orgId="o1" leadId="l1" tasks={[]} />)
    act(() => { ref.current!.openComposer() })
    expect(screen.getByPlaceholderText('Add a task…')).toBeInTheDocument()
    expect(screen.queryByText('No tasks yet.')).not.toBeInTheDocument()
  })
  it('re-focuses the input when openComposer is called while already open', () => {
    const ref = createRef<TasksPanelHandle>()
    render(<TasksPanel ref={ref} orgId="o1" leadId="l1" tasks={[task({})]} />)
    act(() => { ref.current!.openComposer() })
    const input = screen.getByPlaceholderText('Add a task…')
    fireEvent.change(input, { target: { value: 'Call caterer' } }) // non-empty title: blur won't collapse the composer
    act(() => { input.blur() })
    expect(input).not.toHaveFocus()
    act(() => { ref.current!.openComposer() })   // already open — should still (re-)focus
    expect(input).toHaveFocus()
  })
})
