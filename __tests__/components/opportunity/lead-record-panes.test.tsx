import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const push = vi.hoisted(() => vi.fn())
const createInvoice = vi.hoisted(() => vi.fn())
const generateFromProposal = vi.hoisted(() => vi.fn())
const createVendor = vi.hoisted(() => vi.fn())
const updateVendor = vi.hoisted(() => vi.fn())
const deleteVendor = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('@/actions/invoices', () => ({ createInvoice, generateFromProposal }))
vi.mock('@/actions/vendors', () => ({ createVendor, updateVendor, deleteVendor }))

import { LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import { LeadInvoicesClient } from '@/components/admin/LeadInvoicesClient'
import { LeadVendorsClient } from '@/components/admin/LeadVendorsClient'
import { opportunityRollup } from '@/lib/opportunity-rollup'
import { todayYmd } from '@/lib/opportunity-detail'
import { money } from '@/lib/pipeline-presentation'
import type { NormalizedInvoice, Proposal, ProposalStatus, Vendor, VendorStatus } from '@/lib/types'

function proposal(id: string, status: ProposalStatus, total: number): Proposal {
  return {
    id,
    org_id: 'o1',
    lead_id: 'l1',
    token: `tok-${id}`,
    title: `Proposal ${id}`,
    status,
    line_items: [{ description: 'Bar service', quantity: 1, unit_price: total }],
    created_at: `2026-08-0${id.slice(-1)}`,
  }
}

function invoice(id: string, over: Partial<NormalizedInvoice> = {}): NormalizedInvoice {
  return {
    id,
    org_id: 'o1',
    lead_id: 'l1',
    token: `tok-${id}`,
    type: 'deposit',
    lifecycle: 'sent',
    delivery: 'unsent',
    accounting: 'open',
    dispute: 'none',
    title: `Invoice ${id}`,
    line_items: [{ description: 'Deposit', quantity: 1, unit_price: 1000 }],
    payments: [],
    created_at: '2026-08-01',
    ...over,
  } as NormalizedInvoice
}

function vendor(id: string, status: VendorStatus, cost?: number): Vendor {
  return { id, lead_id: 'l1', name: `Vendor ${id}`, service: 'Florist', status, cost, created_at: '2026-08-01' }
}

/**
 * The tone class on the StatusPill carrying `label`, e.g.
 * `bg-[var(--status-alert-bg)]`. Scoped to `[data-slot="status-pill"]` because
 * the same words also appear in the vendor rows' native status `<option>`s.
 */
function toneClass(label: string): string {
  const pills = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="status-pill"]'))
    .filter((el) => el.textContent === label)
  expect(pills, `expected exactly one "${label}" StatusPill`).toHaveLength(1)
  const hit = Array.from(pills[0].classList).find((c) => c.startsWith('bg-[var(--status-'))
  expect(hit, `expected a tone class on the "${label}" StatusPill`).toBeDefined()
  return hit!
}

const proposalProps = { orgId: 'o1', orgSlug: 'acme', leadId: 'l1' }
const invoiceProps = { orgId: 'o1', orgSlug: 'acme', leadId: 'l1', acceptedProposals: [] }
const vendorProps = { orgId: 'o1', leadId: 'l1' }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  createInvoice.mockResolvedValue({ id: 'inv-new' })
  generateFromProposal.mockResolvedValue({ id: 'inv-9' })
  createVendor.mockResolvedValue(vendor('vNew', 'potential'))
  updateVendor.mockResolvedValue(undefined)
  deleteVendor.mockResolvedValue(undefined)
})

describe('LeadProposalsClient', () => {
  it('gives every proposal status its own tone instead of one gray badge', () => {
    render(<LeadProposalsClient {...proposalProps} proposals={[
      proposal('p1', 'draft', 100),
      proposal('p2', 'sent', 200),
      proposal('p3', 'accepted', 300),
      proposal('p4', 'voided', 400),
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: /show all 4/i }))
    const tones = ['Draft', 'Sent', 'Accepted', 'Voided'].map(toneClass)
    expect(new Set(tones).size).toBe(4)
  })

  it('renders the proposal total as money, thousands-separated and tabular', () => {
    render(<LeadProposalsClient {...proposalProps} proposals={[proposal('p1', 'sent', 1200)]} />)
    const amount = screen.getByText('$1,200')
    expect(amount).toHaveClass('text-[var(--money-green)]')
    expect(amount).toHaveClass('tabular-nums')
    expect(screen.queryByText('$1200.00')).toBeNull()
  })

  it('empty state offers exactly one CTA and it works', () => {
    render(<LeadProposalsClient {...proposalProps} proposals={[]} />)
    const empty = screen.getByText('No proposals yet').closest('[data-slot="empty-state"]') as HTMLElement
    const cta = within(empty).getByRole('button')
    fireEvent.click(cta)
    expect(push).toHaveBeenCalledWith('/acme/leads/l1/proposals/new')
  })

  it('links each row at its editor', () => {
    render(<LeadProposalsClient {...proposalProps} proposals={[proposal('p1', 'sent', 100)]} />)
    expect(screen.getByRole('link', { name: /Proposal p1/ })).toHaveAttribute('href', '/acme/leads/l1/proposals/p1')
  })

  it('keeps cents on a fractional total instead of rendering "$1,200.5"', () => {
    render(<LeadProposalsClient {...proposalProps} proposals={[proposal('p1', 'sent', 1200.5)]} />)
    expect(screen.getByText('$1,200.50')).toBeInTheDocument()
    expect(screen.queryByText('$1,200.5')).toBeNull()
  })

  // The EmptyState CTA is the only route to /leads/[leadId]/proposals/new on
  // this screen, and the card's "+ New" header action is inside the same
  // section. Hiding it below md leaves a brand-new opportunity with no way to
  // draft a proposal on a phone.
  it('stays on screen below md when empty — it holds the only way to start one', () => {
    render(<LeadProposalsClient {...proposalProps} proposals={[]} />)
    const card = document.querySelector('[data-slot="related-record-card"]') as HTMLElement
    expect(card.className).not.toMatch(/max-md:hidden/)
  })

  it('offers a working overflow control rather than the kit’s dead "View all" line', () => {
    render(<LeadProposalsClient {...proposalProps} proposals={[
      proposal('p1', 'draft', 100), proposal('p2', 'sent', 200),
      proposal('p3', 'accepted', 300), proposal('p4', 'voided', 400),
    ]} />)
    expect(screen.queryByText(/View all 4/)).toBeNull()
    expect(screen.queryByText('Proposal p4')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /show all 4/i }))
    expect(screen.getByText('Proposal p4')).toBeInTheDocument()
  })
})

describe('LeadInvoicesClient', () => {
  it('separates draft, sent, paid and overdue by tone', () => {
    const paid = invoice('i3', { payments: [{ amount: 1000, method: 'cash', recorded_at: '2026-08-02T00:00:00.000Z' }] })
    const overdue = invoice('i4', { due_date: '2000-01-01' })
    render(<LeadInvoicesClient {...invoiceProps} invoices={[
      invoice('i1', { lifecycle: 'draft' }), invoice('i2'), paid, overdue,
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: /show all 4/i }))
    const tones = ['Draft', 'Sent', 'Paid', 'Overdue'].map(toneClass)
    expect(new Set(tones).size).toBe(4)
  })

  it('never labels a zero-total draft "Paid"', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[invoice('i1', { lifecycle: 'draft', line_items: [] })]} />)
    expect(screen.queryByText('Paid')).toBeNull()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('sums the open balance with the same rule as opportunityRollup (not void, positive balance)', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[
      invoice('i1'),
      invoice('i2', { line_items: [{ description: 'x', quantity: 1, unit_price: 500 }] }),
      invoice('i3', { lifecycle: 'void', line_items: [{ description: 'x', quantity: 1, unit_price: 9999 }] }),
    ]} />)
    const total = screen.getByTestId('open-balance')
    expect(total).toHaveTextContent('$1,500')
    expect(total).toHaveClass('tabular-nums')
  })

  // The bug this replaces: `overdue` was a boolean `some()`, and the whole open
  // balance was painted destructive with "past due" appended — so $10,000 open
  // of which $500 is late rendered "$10,000 past due". A false statement about
  // money on the pane the operator bills from.
  it('states the past-due amount as its own figure rather than toning the whole balance', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[
      invoice('i1', { line_items: [{ description: 'x', quantity: 1, unit_price: 9500 }] }),
      invoice('i2', { due_date: '2000-01-01', line_items: [{ description: 'x', quantity: 1, unit_price: 500 }] }),
    ]} />)
    const open = screen.getByTestId('open-balance')
    expect(open).toHaveTextContent('$10,000')
    expect(open).toHaveClass('text-[var(--money-green)]')
    expect(open).not.toHaveClass('text-destructive')
    const past = screen.getByTestId('overdue-balance')
    expect(past).toHaveTextContent('$500 past due')
    expect(past).toHaveClass('text-destructive')
  })

  // opportunity-rollup.ts:81-86 has NO lifecycle test — any live invoice past
  // its due date feeds the KPI band's overdue figure. The pane has to use the
  // same predicate or the two disagree on the same screen.
  it('counts a past-due DRAFT, matching opportunityRollup exactly', () => {
    const invoices = [
      invoice('i1', {
        lifecycle: 'draft',
        due_date: '2000-01-01',
        line_items: [{ description: 'x', quantity: 1, unit_price: 400 }],
      }),
      invoice('i2', { line_items: [{ description: 'x', quantity: 1, unit_price: 600 }] }),
    ]
    render(<LeadInvoicesClient {...invoiceProps} invoices={invoices} />)
    const band = opportunityRollup({
      lead: { estimated_value: undefined, event_date: undefined },
      invoices,
      tasks: [],
      pastBookings: 0,
      today: todayYmd(),
    })
    expect(band.overdueBalance).toBe(400)
    expect(screen.getByTestId('overdue-balance')).toHaveTextContent(`${money(band.overdueBalance)} past due`)
    expect(screen.getByTestId('open-balance')).toHaveTextContent(money(band.openBalance))
  })

  it('shows no past-due line at all when nothing is late', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[invoice('i1')]} />)
    expect(screen.queryByTestId('overdue-balance')).toBeNull()
    expect(screen.queryByText(/past due/)).toBeNull()
  })

  it('keeps cents on a fractional balance instead of rendering "$1,200.5"', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[
      invoice('i1', { line_items: [{ description: 'x', quantity: 1, unit_price: 1200.5 }] }),
    ]} />)
    expect(screen.getByTestId('open-balance')).toHaveTextContent('$1,200.50')
    expect(screen.queryByText('$1,200.5')).toBeNull()
  })

  it('empty state offers exactly one CTA and it works', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[]} />)
    const empty = screen.getByText('No invoices yet').closest('[data-slot="empty-state"]') as HTMLElement
    const cta = within(empty).getByRole('button')
    fireEvent.click(cta)
    expect(createInvoice).toHaveBeenCalledWith('o1', 'l1', {})
  })

  // "Create the first invoice" is the only caller of createInvoice on this
  // screen; the card's "+ New" header action is inside the same hidden section.
  it('stays on screen below md when empty — it holds the only way to bill', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[]} />)
    const card = document.querySelector('[data-slot="related-record-card"]') as HTMLElement
    expect(card.className).not.toMatch(/max-md:hidden/)
  })

  it('points the empty state at the accepted proposal when there is one to bill', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[]} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    const empty = screen.getByText('No invoices yet').closest('[data-slot="empty-state"]') as HTMLElement
    const cta = within(empty).getByRole('button')
    expect(cta).toHaveAccessibleName(/generate from proposal/i)
    fireEvent.click(cta)
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
  })

  it('keeps generate-from-proposal reachable once invoices exist', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[invoice('i1')]} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /generate from proposal/i }))
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
  })

  // Rendered above the card, the panel pushed the card — and the button the
  // operator had just clicked — down the page, scrolling the revealed Type
  // select away from their focus point. jsdom has no viewport, so only DOM
  // order can catch it.
  it('opens the generate panel below its footer trigger, inside the card', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[invoice('i1')]} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    const trigger = screen.getByRole('button', { name: /generate from proposal/i })
    fireEvent.click(trigger)
    const panel = screen.getByTestId('generate-panel')
    const card = document.querySelector('[data-slot="related-record-card"]') as HTMLElement
    expect(card.contains(panel)).toBe(true)
    expect(screen.getByTestId('open-balance').compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(trigger.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // The kit drops `footer` entirely in the empty branch, so the empty state's
  // panel lives outside the card — but still AFTER it, never above it.
  it('opens the empty-state generate panel after the card, not above it', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[]} acceptedProposals={[{ id: 'p1', title: 'Wedding' }]} />)
    const empty = screen.getByText('No invoices yet').closest('[data-slot="empty-state"]') as HTMLElement
    fireEvent.click(within(empty).getByRole('button'))
    const panel = screen.getByTestId('generate-panel')
    const card = document.querySelector('[data-slot="related-record-card"]') as HTMLElement
    expect(card.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
  })

  it('renders money without the old toFixed(2) format', () => {
    render(<LeadInvoicesClient {...invoiceProps} invoices={[invoice('i1')]} />)
    expect(screen.queryByText(/\$1000\.00/)).toBeNull()
    expect(screen.getAllByText('$1,000').length).toBeGreaterThan(0)
  })
})

describe('LeadVendorsClient', () => {
  it('tones the vendor status, not just the service', () => {
    render(<LeadVendorsClient {...vendorProps} vendors={[
      vendor('v1', 'potential', 100), vendor('v2', 'confirmed', 200),
    ]} />)
    const tones = ['Potential', 'Confirmed'].map(toneClass)
    expect(new Set(tones).size).toBe(2)
  })

  it('promotes the cost rollups to figures and paints per-row cost as money', () => {
    render(<LeadVendorsClient {...vendorProps} vendors={[
      vendor('v1', 'potential', 100), vendor('v2', 'confirmed', 200),
    ]} />)
    expect(screen.getByTestId('vendor-confirmed-cost')).toHaveTextContent('$200')
    expect(screen.getByTestId('vendor-total-cost')).toHaveTextContent('$300')
    const rowCost = screen.getByTestId('vendor-cost-v1')
    expect(rowCost).toHaveClass('text-[var(--money-green)]')
    expect(rowCost).toHaveClass('tabular-nums')
  })

  it('keeps cents on a fractional cost and on the rollups above it', () => {
    render(<LeadVendorsClient {...vendorProps} vendors={[
      vendor('v1', 'potential', 100.25), vendor('v2', 'confirmed', 200.5),
    ]} />)
    expect(screen.getByTestId('vendor-cost-v1')).toHaveTextContent('$100.25')
    expect(screen.getByTestId('vendor-confirmed-cost')).toHaveTextContent('$200.50')
    expect(screen.getByTestId('vendor-total-cost')).toHaveTextContent('$300.75')
  })

  it('confirms deletion in a kit dialog and never calls window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    deleteVendor.mockResolvedValue(undefined)
    render(<LeadVendorsClient {...vendorProps} vendors={[vendor('v1', 'confirmed', 100)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Vendor v1' }))
    const dialog = await screen.findByRole('dialog')
    expect(confirmSpy).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(deleteVendor).toHaveBeenCalledWith('o1', 'v1'))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('cancelling the dialog leaves the vendor alone', async () => {
    render(<LeadVendorsClient {...vendorProps} vendors={[vendor('v1', 'confirmed', 100)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Vendor v1' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deleteVendor).not.toHaveBeenCalled()
    expect(screen.getByText('Vendor v1')).toBeInTheDocument()
  })

  it('empty state offers exactly one CTA and it opens the composer', () => {
    render(<LeadVendorsClient {...vendorProps} vendors={[]} />)
    const empty = screen.getByText('No vendors yet').closest('[data-slot="empty-state"]') as HTMLElement
    const cta = within(empty).getByRole('button')
    fireEvent.click(cta)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })
})
