import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
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
import { addDays, todayYmd } from '@/lib/opportunity-detail'
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
  it('renders exactly one kit EmptyState with exactly one forward CTA', () => {
    const { container } = render(<TasksPanel orgId="o1" leadId="l1" tasks={[]} />)
    const empties = container.querySelectorAll('[data-slot="empty-state"]')
    expect(empties).toHaveLength(1)
    const empty = empties[0] as HTMLElement
    expect(within(empty).getByText('No tasks')).toBeInTheDocument()
    // R4 is "message + ONE CTA". Two buttons is a fork in the road, not a next step.
    expect(within(empty).getAllByRole('button')).toHaveLength(1)
    // OpportunityDetailClient.test.tsx (P5) asserts getByText(/No tasks/), which
    // THROWS on a second match — so the description must not restate the title,
    // and the old "No tasks yet." branch must be gone rather than merely hidden.
    expect(screen.getAllByText(/No tasks/)).toHaveLength(1)
    expect(screen.queryByText('No tasks yet.')).not.toBeInTheDocument()
  })
  it('offers only one "Add a task" control at a time', () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[]} />)
    expect(screen.getAllByRole('button', { name: 'Add a task' })).toHaveLength(1)
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
  it('does not co-render the empty state with the open composer', () => {
    const ref = createRef<TasksPanelHandle>()
    const { container } = render(<TasksPanel ref={ref} orgId="o1" leadId="l1" tasks={[]} />)
    act(() => { ref.current!.openComposer() })
    expect(screen.getByPlaceholderText('Add a task…')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="empty-state"]')).toBeNull()
    expect(screen.queryByText(/No tasks/)).not.toBeInTheDocument()
  })
  it('keeps the imperative handle working after the empty state replaced the bare sentence', () => {
    const ref = createRef<TasksPanelHandle>()
    const { container } = render(<TasksPanel ref={ref} orgId="o1" leadId="l1" tasks={[]} />)
    expect(container.querySelector('[data-slot="empty-state"]')).not.toBeNull()
    act(() => { ref.current!.openComposer() })
    expect(screen.getByPlaceholderText('Add a task…')).toHaveFocus()
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

describe('TasksPanel due-date tone', () => {
  const today = todayYmd()

  function dueChip(due: string): HTMLElement {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[task({ due_date: due })]} />)
    return screen.getByTestId('task-due')
  }

  it('paints a task due today with the shared pending status token, not a raw amber literal', () => {
    const chip = dueChip(today)
    expect(chip.className).toContain('var(--status-pending-fg)')
    expect(chip.className).not.toContain('amber')
    // A `dark:` variant here would mean the tone was hand-picked twice; the
    // status tokens already carry their own dark values (app/globals.css:247).
    expect(chip.className).not.toContain('dark:')
  })

  it('paints an overdue task with the destructive token', () => {
    expect(dueChip(addDays(today, -3)).className).toContain('text-destructive')
  })

  it('leaves an upcoming task in muted prose', () => {
    const chip = dueChip(addDays(today, 9))
    expect(chip.className).toContain('text-muted-foreground')
    expect(chip.className).not.toContain('var(--status-pending-fg)')
  })

  it('reads the due date in the module date format, not a raw ISO string', () => {
    // shortDate() from lib/pipeline-presentation — the one format the rest of
    // the opportunity page (FactsGrid, DatesPanel, the KPI band note) uses.
    expect(dueChip('2026-09-04')).toHaveTextContent('Sep 4, 2026')
  })
})

describe('TasksPanel counts', () => {
  const today = todayYmd()

  it('promotes the open and overdue counts the rollup computes and no surface renders', () => {
    render(
      <TasksPanel
        orgId="o1"
        leadId="l1"
        tasks={[
          task({ id: 'a', title: 'A', due_date: addDays(today, -1) }),
          task({ id: 'b', title: 'B', due_date: addDays(today, 5) }),
          task({ id: 'c', title: 'C', done: true }),
        ]}
      />
    )
    expect(screen.getByText('2 open')).toBeInTheDocument()
    const overdue = screen.getByText('1 overdue')
    const pill = overdue.closest('[data-slot="status-pill"]')
    expect(pill).not.toBeNull()
    expect(pill!.className).toContain('var(--status-alert-fg)')
  })

  it('says nothing about overdue work when there is none', () => {
    render(<TasksPanel orgId="o1" leadId="l1" tasks={[task({ due_date: addDays(today, 5) })]} />)
    expect(screen.getByText('1 open')).toBeInTheDocument()
    expect(screen.queryByText(/overdue/)).toBeNull()
  })
})
