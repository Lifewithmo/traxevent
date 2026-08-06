import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  completeChecklistStep: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/ops-evidence', () => ({
  uploadEvidencePhoto: vi.fn().mockResolvedValue({ url: 'https://cdn.example/x.jpg' }),
}))

import { completeChecklistStep } from '@/actions/event-ops'
import { uploadEvidencePhoto } from '@/actions/ops-evidence'
import { ChecklistsCard } from '@/components/admin/ops/ChecklistsCard'
import type { OpsPlan } from '@/lib/types'

const plan: OpsPlan = {
  package_ids: [], requirements: { guests: 10 },
  deadlines: [], shopping_list: [], packing_list: [],
  checklists: [
    {
      id: 'c1', name: 'Setup', phase: 'setup',
      steps: [
        { text: 'Level the cart', evidence: 'none', done: false },
        { text: 'Record water pressure', evidence: 'number', done: false },
        { text: 'Photo of finished bar', evidence: 'photo', done: false },
      ],
    },
  ],
  needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('ChecklistsCard', () => {
  it('completes a plain step on toggle', async () => {
    const onPlanChange = vi.fn()
    render(<ChecklistsCard orgId="o1" eventId="e1" plan={plan} onPlanChange={onPlanChange} />)
    fireEvent.click(screen.getByLabelText('Level the cart'))
    await waitFor(() => expect(completeChecklistStep).toHaveBeenCalledWith('o1', 'e1', 'c1', 0, { done: true }))
    expect(onPlanChange).toHaveBeenCalled()
  })

  it('requires a number before completing a number-evidence step', async () => {
    render(<ChecklistsCard orgId="o1" eventId="e1" plan={plan} onPlanChange={vi.fn()} />)
    const doneBtn = screen.getByRole('button', { name: 'Done: Record water pressure' })
    expect(doneBtn).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Value for Record water pressure'), { target: { value: '42' } })
    fireEvent.click(doneBtn)
    await waitFor(() => expect(completeChecklistStep).toHaveBeenCalledWith('o1', 'e1', 'c1', 1, { done: true, evidence_value: '42' }))
  })

  it('uploads the photo then completes the photo-evidence step with its url', async () => {
    render(<ChecklistsCard orgId="o1" eventId="e1" plan={plan} onPlanChange={vi.fn()} />)
    const input = screen.getByLabelText('Photo for Photo of finished bar')
    fireEvent.change(input, { target: { files: [new File(['x'], 'bar.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(uploadEvidencePhoto).toHaveBeenCalled())
    await waitFor(() => expect(completeChecklistStep).toHaveBeenCalledWith('o1', 'e1', 'c1', 2, {
      done: true, evidence_value: 'https://cdn.example/x.jpg',
    }))
  })

  it('can un-complete a step', async () => {
    const done = { ...plan, checklists: [{ ...plan.checklists[0], steps: [{ text: 'Level the cart', evidence: 'none' as const, done: true }] }] }
    render(<ChecklistsCard orgId="o1" eventId="e1" plan={done} onPlanChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Level the cart'))
    await waitFor(() => expect(completeChecklistStep).toHaveBeenCalledWith('o1', 'e1', 'c1', 0, { done: false }))
  })
})
