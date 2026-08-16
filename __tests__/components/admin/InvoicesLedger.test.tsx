import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error('notFound')
  }),
}))

const listAllInvoicesMock = vi.hoisted(() => vi.fn())
const listLeadsMock = vi.hoisted(() => vi.fn())
const getInvoiceNumberingMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({
        limit: () => ({ get: async () => ({ empty: false, docs: [{ id: 'org1' }] }) }),
      }),
    }),
  },
}))
vi.mock('@/actions/invoices', () => ({
  listAllInvoices: listAllInvoicesMock,
  getInvoiceNumbering: getInvoiceNumberingMock,
  updateInvoiceNumbering: vi.fn(),
}))
vi.mock('@/actions/leads', () => ({ listLeads: listLeadsMock }))

import { InvoicesLedger } from '@/components/admin/invoices/InvoicesLedger'
import { InvoicesKpiBand } from '@/components/admin/invoices/InvoicesKpiBand'
import InvoicesPage from '@/app/(admin)/[orgSlug]/invoices/page'
import { buildInvoiceLedger, type LedgerInvoice } from '@/lib/invoices-ledger'
import type { InvoiceLineItem, InvoicePayment } from '@/lib/types'

const NOW = new Date('2026-08-16T12:00:00.000Z')

const li = (unit_price: number): InvoiceLineItem => ({ description: 'x', quantity: 1, unit_price })
const pay = (amount: number, recorded_at = '2026-08-10T00:00:00.000Z'): InvoicePayment => ({
  amount,
  recorded_at,
})

function inv(over: Partial<LedgerInvoice> & { id: string }): LedgerInvoice {
  return {
    org_id: 'o1',
    lead_id: `lead-${over.id}`,
    token: 'tok',
    type: 'quick',
    lifecycle: 'sent',
    delivery: 'not_sent',
    accounting: 'not_connected',
    dispute: 'none',
    line_items: [li(100)],
    payments: [],
    created_at: '2026-08-01T00:00:00.000Z',
    clientName: 'Some Job',
    ...over,
  }
}

// One of each lifecycle/money state, so every group is populated exactly once.
const FIXTURE: LedgerInvoice[] = [
  inv({
    id: 'late',
    number: 'INV-1001',
    clientName: 'Harbor Gala',
    due_date: '2026-07-01',
    line_items: [li(1200)],
  }),
  inv({ id: 'soon', number: 'INV-1002', due_date: '2026-08-18', line_items: [li(500)] }),
  inv({ id: 'waiting', number: 'INV-1003', due_date: '2026-10-01', line_items: [li(300)] }),
  inv({ id: 'draft', number: 'INV-1004', lifecycle: 'draft', line_items: [li(800)] }),
  inv({
    id: 'done',
    number: 'INV-1005',
    line_items: [li(400)],
    payments: [pay(400, '2026-08-05T00:00:00.000Z')],
  }),
]

function renderLedger(rows: LedgerInvoice[] = FIXTURE) {
  return render(<InvoicesLedger orgSlug="acme" groups={buildInvoiceLedger(rows, NOW)} />)
}

describe('InvoicesKpiBand', () => {
  it('reports the four AR figures off buildMoneyOverview', () => {
    render(<InvoicesKpiBand invoices={FIXTURE} now={NOW} />)
    // Outstanding = 1200 + 500 + 300 (drafts and the paid one are not AR).
    expect(screen.getByText('$2,000')).toBeInTheDocument()
    expect(screen.getByText('3 open invoices')).toBeInTheDocument()
    // Overdue = the single past-due invoice.
    expect(screen.getByText('$1,200')).toBeInTheDocument()
    expect(screen.getByText('1 invoice past due')).toBeInTheDocument()
    // Drafts = count, with their combined total as the note.
    expect(screen.getByText('Drafts')).toBeInTheDocument()
    expect(screen.getByText('$800 not yet sent')).toBeInTheDocument()
    // Collected = calendar month to date, NOT a trailing 30 days.
    expect(screen.getByText('Collected this month')).toBeInTheDocument()
    expect(screen.getByText('$400')).toBeInTheDocument()
    expect(screen.getByText('August to date')).toBeInTheDocument()
    expect(screen.queryByText(/30d/)).not.toBeInTheDocument()
  })

  it('drops the alert tone and says so when nothing is past due', () => {
    render(<InvoicesKpiBand invoices={[FIXTURE[1], FIXTURE[3]]} now={NOW} />)
    expect(screen.getByText('nothing past due')).toBeInTheDocument()
    expect(screen.getByText('1 open invoice')).toBeInTheDocument()
  })
})

describe('InvoicesLedger', () => {
  it('renders a distinct pill per money state instead of one gray badge', () => {
    const { container } = renderLedger()
    const pills = [...container.querySelectorAll('[data-slot="status-pill"]')].map(
      (el) => el.textContent
    )
    // Five rows, five pills — and the old table rendered one gray Badge for all of them.
    expect(pills).toEqual(['Overdue', 'Sent', 'Sent', 'Draft', 'Paid'])
    const overdue = container.querySelector('[data-slot="status-pill"]')!
    expect(overdue.className).toContain('--status-alert-fg')
  })

  it('shows each group header with its own money total', () => {
    renderLedger()
    expect(screen.getByText('Overdue · 1')).toBeInTheDocument()
    expect(screen.getByText('$1,200')).toBeInTheDocument()
    expect(screen.getByText('Due soon · 1')).toBeInTheDocument()
    expect(screen.getByText('Awaiting payment · 1')).toBeInTheDocument()
    expect(screen.getByText('Drafts · 1')).toBeInTheDocument()
    expect(screen.getByText('Settled · 1')).toBeInTheDocument()
  })

  it('surfaces the job name and due date the old table dropped', () => {
    renderLedger()
    expect(screen.getByText('Harbor Gala')).toBeInTheDocument()
    expect(screen.getByText(/Due Jul 1, 2026 · 46d late/)).toBeInTheDocument()
    expect(screen.getByText('Due Oct 1, 2026')).toBeInTheDocument()
  })

  it('filters the ledger when a chip is pressed', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderLedger()
    expect(screen.getAllByTestId('invoice-ledger-row')).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: /^Drafts/ }))
    const rows = screen.getAllByTestId('invoice-ledger-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('#INV-1004')).toBeInTheDocument()
    expect(screen.queryByText('#INV-1001')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Drafts/ })).toHaveAttribute('aria-pressed', 'true')

    // "Open" is every invoice still owed — overdue included.
    await user.click(screen.getByRole('button', { name: /^Open/ }))
    expect(screen.getAllByTestId('invoice-ledger-row')).toHaveLength(3)
    expect(screen.getByText('#INV-1001')).toBeInTheDocument()
    expect(screen.queryByText('#INV-1005')).not.toBeInTheDocument()
  })

  it('offers a way back when a filter matches nothing', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderLedger([FIXTURE[3]]) // drafts only
    await user.click(screen.getByRole('button', { name: /^Overdue/ }))
    expect(screen.getByText('No invoices match this filter')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all invoices' }))
    expect(screen.getAllByTestId('invoice-ledger-row')).toHaveLength(1)
  })

  it('renders an empty state with one CTA when the org has no invoices', () => {
    renderLedger([])
    expect(screen.getByText('No invoices yet')).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: 'Go to jobs' })
    expect(cta).toHaveAttribute('href', '/acme/leads')
    expect(screen.queryAllByTestId('invoice-ledger-row')).toHaveLength(0)
  })

  it('links each row to the invoice under its lead, and shows overpayment as negative', () => {
    renderLedger([inv({ id: 'over', number: 'INV-9', line_items: [li(100)], payments: [pay(120)] })])
    expect(screen.getByRole('link', { name: '#INV-9' })).toHaveAttribute(
      'href',
      '/acme/leads/lead-over/invoices/over'
    )
    expect(screen.getByText('−$20.00')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })
})

describe('/invoices route — admin-only numbering must not throw the page', () => {
  const params = Promise.resolve({ orgSlug: 'acme' })

  beforeEach(() => {
    // listAllInvoices returns bare invoices; the "Job" column is joined on from
    // listLeads, so the lead names here deliberately differ from the fixture's.
    listAllInvoicesMock.mockResolvedValue(FIXTURE)
    listLeadsMock.mockResolvedValue(FIXTURE.map((r) => ({ id: r.lead_id, name: `Job ${r.number}` })))
  })

  it('still renders the ledger for a non-admin member', async () => {
    // getInvoiceNumbering calls assertOrgAdmin. Reading invoices only needs
    // membership, so the rejection must degrade to "no numbering control" —
    // it used to reject the whole Promise.all and blow up the route.
    getInvoiceNumberingMock.mockRejectedValue(new Error('Admin access required'))
    render(await InvoicesPage({ params }))
    expect(screen.getByRole('heading', { name: 'Invoices' })).toBeInTheDocument()
    expect(screen.getAllByTestId('invoice-ledger-row')).toHaveLength(5)
    expect(screen.getByText('Job INV-1001')).toBeInTheDocument() // lead name, joined on
    expect(screen.queryByRole('button', { name: /Numbering/ })).not.toBeInTheDocument()
  })

  it('keeps the numbering control mounted for an admin', async () => {
    getInvoiceNumberingMock.mockResolvedValue({ prefix: 'INV-', next_number: 1006 })
    render(await InvoicesPage({ params }))
    expect(screen.getByRole('button', { name: /Numbering/ })).toBeInTheDocument()
  })
})
