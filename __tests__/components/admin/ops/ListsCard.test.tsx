import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  toggleListItem: vi.fn().mockResolvedValue(undefined),
}))

import { toggleListItem } from '@/actions/event-ops'
import { ListsCard } from '@/components/admin/ops/ListsCard'
import type { OpsPlan } from '@/lib/types'

const plan: OpsPlan = {
  package_ids: [], requirements: { guests: 50 },
  deadlines: [],
  shopping_list: [{ resource_id: 'r1', name: 'Espresso beans', qty: 37.5, unit: 'oz', checked: false }],
  packing_list: [{ resource_id: 'r2', name: 'Espresso Machine 02', qty: 1, checked: true }],
  checklists: [],
  needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('ListsCard', () => {
  it('renders shopping and packing items with quantities', () => {
    render(<ListsCard orgId="o1" eventId="e1" plan={plan} orgSlug="acme" eventSlug="gala" onPlanChange={vi.fn()} />)
    expect(screen.getByText('Espresso beans')).toBeInTheDocument()
    expect(screen.getByText('37.5 oz')).toBeInTheDocument()
    expect(screen.getByText('Espresso Machine 02')).toBeInTheDocument()
  })

  it('toggles a shopping item', async () => {
    const onPlanChange = vi.fn()
    render(<ListsCard orgId="o1" eventId="e1" plan={plan} orgSlug="acme" eventSlug="gala" onPlanChange={onPlanChange} />)
    fireEvent.click(screen.getByLabelText('Espresso beans'))
    await waitFor(() => expect(toggleListItem).toHaveBeenCalledWith('o1', 'e1', 'shopping_list', 'r1', true, 'oz'))
    expect(onPlanChange).toHaveBeenCalled()
  })

  it('links to the print view', () => {
    render(<ListsCard orgId="o1" eventId="e1" plan={plan} orgSlug="acme" eventSlug="gala" onPlanChange={vi.fn()} />)
    expect(screen.getByText('Print lists')).toHaveAttribute('href', '/acme/gala/ops/print')
  })
})
