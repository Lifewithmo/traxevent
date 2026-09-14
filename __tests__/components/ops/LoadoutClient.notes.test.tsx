import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Per-item shelf notes (inc-3 S3.3): the LOAD-OUT is the one surface that
// edits them (B5) — expand-row editor, explicit Save, visible failure.

vi.mock('@/actions/event-ops', () => ({
  toggleListItem: vi.fn(),
  setListItemNote: vi.fn(),
  bulkSetListChecked: vi.fn(),
  recomputeOpsLists: vi.fn(),
}))

import { setListItemNote } from '@/actions/event-ops'
import { LoadoutClient } from '@/components/admin/ops/LoadoutClient'
import type { OpsListItem, OpsPlan } from '@/lib/types'

function plan(overrides: Partial<OpsPlan> = {}): OpsPlan {
  return {
    package_ids: ['p1'],
    requirements: { guests: 50 },
    deadlines: [],
    shopping_list: [{ resource_id: 'r-milk', name: 'Milk', qty: 3, unit: 'gal', checked: false } as OpsListItem],
    packing_list: [],
    checklists: [],
    needs_review: false,
    change_log: [],
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const baseProps = {
  orgId: 'o1',
  eventId: 'e1',
  orgSlug: 'acme',
  eventSlug: 'wedding',
  eventStart: '2026-08-12',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoadoutClient — shelf note editor (loadout-only, B5)', () => {
  it('shows a saved note under the item, always visible', () => {
    render(<LoadoutClient {...baseProps} plan={plan({
      shopping_list: [{ resource_id: 'r-milk', name: 'Milk', qty: 3, unit: 'gal', checked: false, note: 'subbed with oat milk' }],
    })} />)
    expect(screen.getByText('subbed with oat milk')).toBeInTheDocument()
  })

  it('expand-row editor saves through setListItemNote and mirrors server truth locally', async () => {
    vi.mocked(setListItemNote).mockResolvedValue(undefined)
    render(<LoadoutClient {...baseProps} plan={plan()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add note for Milk' }))
    const input = screen.getByRole('textbox', { name: 'Note for Milk' })
    // The quiet substitution nudge (S3.3) + the shared length cap.
    expect(input).toHaveAttribute('placeholder', 'Add note… e.g. subbed with oat milk')
    expect(input).toHaveAttribute('maxlength', '200')

    fireEvent.change(input, { target: { value: '  subbed with oat milk  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(setListItemNote).toHaveBeenCalledWith('o1', 'e1', 'shopping_list', 'r-milk', 'subbed with oat milk', 'gal'),
    )
    // Editor closes; the note now renders on the row.
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Note for Milk' })).not.toBeInTheDocument())
    expect(screen.getByText('subbed with oat milk')).toBeInTheDocument()
  })

  it('a failed save stays visible with the draft intact — never a silent drop', async () => {
    vi.mocked(setListItemNote).mockRejectedValue(new Error('offline'))
    render(<LoadoutClient {...baseProps} plan={plan()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add note for Milk' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Note for Milk' }), { target: { value: 'crushed only' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('offline')
    expect(screen.getByRole('textbox', { name: 'Note for Milk' })).toHaveValue('crushed only')
  })
})
