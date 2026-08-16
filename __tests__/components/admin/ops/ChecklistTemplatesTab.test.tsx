import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/work-packages', () => ({
  createChecklistTemplate: vi.fn().mockImplementation(async (_orgId: string, input: object) => ({
    id: 'ct-new', created_at: '2026-08-05T00:00:00.000Z', ...input,
  })),
  deleteChecklistTemplate: vi.fn().mockResolvedValue(undefined),
}))

import { createChecklistTemplate, deleteChecklistTemplate } from '@/actions/work-packages'
import { ChecklistTemplatesTab } from '@/components/admin/ops/ChecklistTemplatesTab'
import type { ChecklistTemplate } from '@/lib/types'

const builtIn: ChecklistTemplate = {
  id: 'bi-cc-prep', name: 'Prep', phase: 'prep',
  steps: [{ text: 'Dial in grinder', evidence: 'none' }],
  created_at: '2026-08-05T00:00:00.000Z',
}
const custom: ChecklistTemplate = {
  id: 'ct-1', name: 'Van check', phase: 'load-out',
  steps: [{ text: 'Fuel', evidence: 'none' }, { text: 'Water tank photo', evidence: 'photo' }],
  created_at: '2026-08-05T00:00:00.000Z',
}

const DELETE_WARNING = 'Packages that attach it will simply stop including it on new events.'

/** Row actions live behind the kit Menu — open it and pick an item. */
async function rowAction(user: ReturnType<typeof userEvent.setup>, templateName: string, item: string) {
  await user.click(screen.getByRole('button', { name: `Actions for ${templateName}` }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

beforeEach(() => vi.clearAllMocks())

describe('ChecklistTemplatesTab', () => {
  it('badges built-in vs custom templates', () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[builtIn, custom]} setTemplates={vi.fn()} ownTemplateIds={['ct-1']} />)
    expect(screen.getByText('Built-in')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('only offers delete on custom templates', () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[builtIn, custom]} setTemplates={vi.fn()} ownTemplateIds={['ct-1']} />)
    expect(screen.queryByRole('button', { name: 'Actions for Prep' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Van check' })).toBeInTheDocument()
  })

  it('creates a template with steps and evidence types', async () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[]} setTemplates={vi.fn()} ownTemplateIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'New checklist' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Generator check' } })
    fireEvent.change(screen.getByLabelText('Phase'), { target: { value: 'setup' } })
    fireEvent.change(screen.getByLabelText('Step 1 text'), { target: { value: 'Record fuel level' } })
    fireEvent.change(screen.getByLabelText('Step 1 evidence'), { target: { value: 'number' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }))
    await waitFor(() => expect(createChecklistTemplate).toHaveBeenCalledWith('o1', {
      name: 'Generator check', phase: 'setup',
      steps: [{ text: 'Record fuel level', evidence: 'number' }],
    }))
  })

  it('creating a template routes through the injected setTemplates', async () => {
    const setTemplates = vi.fn()
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[custom]} setTemplates={setTemplates} ownTemplateIds={['ct-1']} />)
    fireEvent.click(screen.getByRole('button', { name: 'New checklist' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Generator check' } })
    fireEvent.change(screen.getByLabelText('Step 1 text'), { target: { value: 'Record fuel level' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }))
    await waitFor(() => expect(setTemplates).toHaveBeenCalledTimes(1))
    const updater = setTemplates.mock.calls[0][0]
    expect(typeof updater).toBe('function')
    expect(updater([custom])).toEqual([custom, {
      id: 'ct-new', created_at: '2026-08-05T00:00:00.000Z',
      name: 'Generator check', phase: 'prep',
      steps: [{ text: 'Record fuel level', evidence: 'none' }],
    }])
  })

  it('deletes a custom template after confirming in the dialog', async () => {
    const user = userEvent.setup()
    const setTemplates = vi.fn()
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[custom]} setTemplates={setTemplates} ownTemplateIds={['ct-1']} />)
    await rowAction(user, 'Van check', 'Delete')
    expect(await screen.findByText(DELETE_WARNING)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteChecklistTemplate).toHaveBeenCalledWith('o1', 'ct-1'))
    expect(setTemplates).toHaveBeenCalled()
    const updater = setTemplates.mock.calls[0][0]
    expect(updater([custom])).toEqual([])
  })

  it('cancelling the delete dialog does not delete', async () => {
    const user = userEvent.setup()
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[custom]} setTemplates={vi.fn()} ownTemplateIds={['ct-1']} />)
    await rowAction(user, 'Van check', 'Delete')
    expect(await screen.findByText('Delete "Van check"?')).toBeInTheDocument()
    expect(screen.getByText(DELETE_WARNING)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText(DELETE_WARNING)).not.toBeInTheDocument())
    expect(deleteChecklistTemplate).not.toHaveBeenCalled()
  })

  it('renders no heading for a phase with no templates', () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[custom]} setTemplates={vi.fn()} ownTemplateIds={['ct-1']} />)
    expect(screen.getByRole('heading', { name: 'load-out' })).toBeInTheDocument()
    for (const empty of ['prep', 'setup', 'service-close', 'closeout']) {
      expect(screen.queryByRole('heading', { name: empty })).not.toBeInTheDocument()
    }
  })

  it('offers a single New checklist CTA from the empty state', () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[]} setTemplates={vi.fn()} ownTemplateIds={[]} />)
    expect(screen.getByText('No checklists yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New checklist' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'New checklist' }))
    expect(screen.getByRole('button', { name: 'Save checklist' })).toBeInTheDocument()
    expect(screen.queryByText('No checklists yet')).not.toBeInTheDocument()
  })
})
