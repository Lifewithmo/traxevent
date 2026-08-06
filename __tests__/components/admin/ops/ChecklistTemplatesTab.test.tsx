import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

beforeEach(() => vi.clearAllMocks())

describe('ChecklistTemplatesTab', () => {
  it('badges built-in vs custom templates', () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[builtIn, custom]} ownTemplateIds={['ct-1']} />)
    expect(screen.getByText('Built-in')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('only offers delete on custom templates', () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[builtIn, custom]} ownTemplateIds={['ct-1']} />)
    expect(screen.queryByRole('button', { name: 'Delete Prep' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Van check' })).toBeInTheDocument()
  })

  it('creates a template with steps and evidence types', async () => {
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[]} ownTemplateIds={[]} />)
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

  it('deletes a custom template after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ChecklistTemplatesTab orgId="o1" isAdmin templates={[custom]} ownTemplateIds={['ct-1']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Van check' }))
    await waitFor(() => expect(deleteChecklistTemplate).toHaveBeenCalledWith('o1', 'ct-1'))
  })
})
