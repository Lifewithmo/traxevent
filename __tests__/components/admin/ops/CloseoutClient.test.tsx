import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const summary = {
  planned_consumable_cost: 20.625, actual_consumable_cost: 24.75,
  revenue: 1050, planned_margin: 1029.375, actual_margin: 1025.25,
}

vi.mock('@/actions/event-ops', () => ({
  saveActuals: vi.fn().mockResolvedValue(undefined),
  getCloseoutSummary: vi.fn().mockResolvedValue({
    planned_consumable_cost: 20.625, actual_consumable_cost: 24.75,
    revenue: 1050, planned_margin: 1029.375, actual_margin: 1025.25,
  }),
  completeCloseout: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/invoices', () => ({
  generateCloseoutInvoice: vi.fn().mockResolvedValue({ id: 'inv1' }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { saveActuals, completeCloseout } from '@/actions/event-ops'
import { CloseoutClient } from '@/components/admin/ops/CloseoutClient'
import type { OpsPlan } from '@/lib/types'

const plan: OpsPlan = {
  package_ids: ['p1'], requirements: { guests: 50 },
  deadlines: [],
  shopping_list: [{ resource_id: 'r1', name: 'Espresso beans', qty: 37.5, unit: 'oz', checked: true }],
  packing_list: [], checklists: [],
  needs_review: false, change_log: [], created_at: '2026-08-01T00:00:00.000Z',
}

const base = {
  orgId: 'o1', eventId: 'e1', orgSlug: 'acme', isAdmin: true, eventName: 'Nguyen Wedding',
  plan, closeout: null, summary, summaryError: null, leads: [],
}

beforeEach(() => vi.clearAllMocks())

describe('CloseoutClient', () => {
  it('pre-fills consumable actuals from the shopping list and saves them', async () => {
    render(<CloseoutClient {...base} />)
    const qty = screen.getByLabelText('Actual Espresso beans used')
    expect(qty).toHaveValue(37.5)
    fireEvent.change(qty, { target: { value: '41' } })
    fireEvent.change(screen.getByLabelText('Hours worked'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Tips & on-site sales ($)'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save actuals' }))
    await waitFor(() => expect(saveActuals).toHaveBeenCalledWith('o1', 'e1', {
      consumables: [{ resource_id: 'r1', qty_used: 41 }],
      hours_worked: 6,
      sales: 150,
    }))
  })

  it('renders the margin summary with display rounding', () => {
    render(<CloseoutClient {...base} />)
    expect(screen.getByText('$20.63')).toBeInTheDocument()   // planned cost
    expect(screen.getByText('$1025.25')).toBeInTheDocument() // actual margin
  })

  it('surfaces a summary error actionably', () => {
    render(<CloseoutClient {...base} summary={null} summaryError="Package no longer exists: p9" />)
    expect(screen.getByText(/package no longer exists/i)).toBeInTheDocument()
    expect(screen.getByText(/restore it in the catalog/i)).toBeInTheDocument()
  })

  it('completes closeout as admin once actuals exist', async () => {
    render(<CloseoutClient {...base} closeout={{ actuals: { hours_worked: 6 }, completed: false, created_at: 'x' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete closeout' }))
    await waitFor(() => expect(completeCloseout).toHaveBeenCalledWith('o1', 'e1'))
    expect(screen.getByText(/closeout complete/i)).toBeInTheDocument()
  })

  it('hides Complete closeout from non-admins', () => {
    render(<CloseoutClient {...base} isAdmin={false} closeout={{ actuals: { hours_worked: 6 }, completed: false, created_at: 'x' }} />)
    expect(screen.queryByRole('button', { name: 'Complete closeout' })).not.toBeInTheDocument()
  })

  it('generates the final invoice for the picked lead and navigates to it', async () => {
    const { generateCloseoutInvoice } = await import('@/actions/invoices')
    render(<CloseoutClient {...base}
      closeout={{ actuals: { hours_worked: 6 }, completed: true, created_at: 'x' }}
      leads={[{ id: 'l1', name: 'Dana', stage: 'won', created_at: 'x' }]} />)
    fireEvent.change(screen.getByLabelText('Bill to'), { target: { value: 'l1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate final invoice' }))
    await waitFor(() => expect(generateCloseoutInvoice).toHaveBeenCalledWith('o1', 'e1', 'l1'))
  })
})
