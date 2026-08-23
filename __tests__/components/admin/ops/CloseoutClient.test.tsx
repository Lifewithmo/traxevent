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
  plan, closeout: null, summary, summaryError: null, leads: [], linkedLead: null,
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
      leads={[{ id: 'l1', name: 'Dana', stage: 'closed_won', created_at: 'x' }]} />)
    fireEvent.change(screen.getByLabelText('Bill to'), { target: { value: 'l1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate final invoice' }))
    await waitFor(() => expect(generateCloseoutInvoice).toHaveBeenCalledWith('o1', 'e1', 'l1'))
  })

  it('shows the linked opportunity instead of a picker', () => {
    render(<CloseoutClient {...base}
      closeout={{ actuals: { hours_worked: 6 }, completed: true, created_at: 'x' }}
      linkedLead={{ id: 'l1', title: 'Nguyen Wedding' }} leads={[]} />)
    expect(screen.getByText('Nguyen Wedding')).toBeInTheDocument()
    expect(screen.queryByLabelText('Bill to')).not.toBeInTheDocument()
  })

  it('warns when the link is broken and falls back to the picker', () => {
    render(<CloseoutClient {...base}
      closeout={{ actuals: { hours_worked: 6 }, completed: true, created_at: 'x' }}
      linkedLead={null} linkBroken
      leads={[{ id: 'l1', name: 'Dana', stage: 'closed_won', created_at: 'x' }]} />)
    expect(screen.getByRole('status')).toHaveTextContent(/no longer exists/i)
    expect(screen.getByLabelText('Bill to')).toBeInTheDocument()
  })
})

// ——— Delta-chip honesty + save-race regressions (additive) ———————————————————
// Live-recompute fixture matching the saved-summary figures above:
// 0.75 oz/guest × 50 guests = 37.5 oz planned @ $0.55/oz = $20.625 planned cost.
const packages = [{
  id: 'p1', name: 'Espresso bar', price: 1050,
  lines: [{ kind: 'consumable' as const, resource_id: 'r1', qty_per_guest: 0.75 }],
  created_at: 'x',
}]
const resources = [
  { id: 'r1', name: 'Espresso beans', kind: 'consumable' as const, unit: 'oz', unit_cost: 0.55, created_at: 'x' },
]
// What closeoutSummaryCore returns before anything has been saved: zero actuals
// against a costed plan, so actual_margin === revenue.
const zeroActualSummary = {
  planned_consumable_cost: 20.625, actual_consumable_cost: 0,
  revenue: 1050, planned_margin: 1029.375, actual_margin: 1050,
}

describe('CloseoutClient delta chips', () => {
  it('shows the saved summary with no delta chips on a pristine zero-actuals load', () => {
    render(<CloseoutClient {...base} packages={packages} resources={resources} summary={zeroActualSummary} />)
    // Tiles still render from the saved summary…
    expect(screen.getByText('$1029.38')).toBeInTheDocument() // planned margin
    // …but no chip claims the plan was beaten (or matched) before any actuals exist.
    expect(screen.queryByText(/[+−]\$.* vs plan/)).not.toBeInTheDocument()
    expect(screen.queryByText('on plan')).not.toBeInTheDocument()
  })

  it('reveals delta chips on the first edit, interpreted against the live recompute', () => {
    render(<CloseoutClient {...base} packages={packages} resources={resources} summary={zeroActualSummary} />)
    fireEvent.change(screen.getByLabelText('Actual Espresso beans used'), { target: { value: '30' } })
    expect(screen.getByText('+$4.13 vs plan')).toBeInTheDocument() // margin: 30oz × $0.55 = $16.50 spent vs $20.625 planned
    expect(screen.getByText('−$4.13 vs plan')).toBeInTheDocument() // consumables under plan
  })

  it('keeps delta chips on load when actuals were already saved', () => {
    render(<CloseoutClient {...base} closeout={{ actuals: { hours_worked: 6 }, completed: false, created_at: 'x' }} />)
    expect(screen.getByText('−$4.13 vs plan')).toBeInTheDocument() // margin under plan, from the saved summary
    expect(screen.getByText('+$4.13 vs plan')).toBeInTheDocument() // consumables over plan
  })

  it('does not echo the sales input back as a revenue delta chip', () => {
    render(<CloseoutClient {...base} packages={packages} resources={resources} summary={zeroActualSummary} />)
    fireEvent.change(screen.getByLabelText('Tips & on-site sales ($)'), { target: { value: '150' } })
    expect(screen.getByText('$1200.00')).toBeInTheDocument() // revenue tile already includes the sales
    expect(screen.queryByText('+$150.00 vs plan')).not.toBeInTheDocument()
    expect(screen.getByText('on plan')).toBeInTheDocument()  // margin chip stays the interpreted figure
  })

  it('keeps showing the live recompute for edits typed during an in-flight save', async () => {
    let resolveSave!: () => void
    vi.mocked(saveActuals).mockReturnValueOnce(new Promise<void>((res) => { resolveSave = res }))
    render(<CloseoutClient {...base} packages={packages} resources={resources} summary={zeroActualSummary} />)

    fireEvent.change(screen.getByLabelText('Actual Espresso beans used'), { target: { value: '41' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save actuals' })) // payload captures qty 41
    fireEvent.change(screen.getByLabelText('Actual Espresso beans used'), { target: { value: '30' } }) // mid-flight edit
    resolveSave()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save actuals' })).toBeEnabled())

    // The margin card must reflect the newer qty-30 live recompute ($1050 − $16.50),
    // not the just-fetched saved summary (actual margin $1025.25).
    expect(screen.getByText('$1033.50')).toBeInTheDocument()
    expect(screen.queryByText('$1025.25')).not.toBeInTheDocument()
  })
})
