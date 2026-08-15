import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvoiceEditorClient } from '@/components/admin/InvoiceEditorClient'
import type { NormalizedInvoice, InvoiceVersion } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const sendInvoiceMock = vi.fn(async () => ({ number: 'BRW-1042', emailDelivered: true }))
vi.mock('@/actions/invoices', () => ({
  updateInvoice: vi.fn(), voidInvoice: vi.fn(),
  recordPayment: vi.fn(), deleteInvoice: vi.fn(),
  sendInvoice: (...args: unknown[]) => sendInvoiceMock(...(args as [])),
}))
// The catalog picker loads work packages on open; keep it inert here (Task 5 owns its behavior).
vi.mock('@/actions/work-packages', () => ({
  listWorkPackages: vi.fn(async () => []), createWorkPackage: vi.fn(),
}))

const inv = (o: Partial<NormalizedInvoice>): NormalizedInvoice => ({
  id: 'inv1', org_id: 'org1', lead_id: 'l', token: 't', type: 'quick', lifecycle: 'draft',
  delivery: 'not_sent', accounting: 'not_connected', dispute: 'none',
  line_items: [], payments: [], created_at: '', ...o,
})

const v1: InvoiceVersion = { sent_at: '2026-08-01T00:00:00.000Z', line_items: [{ description: 'a', quantity: 1, unit_price: 10 }] }
const v2: InvoiceVersion = { sent_at: '2026-08-05T00:00:00.000Z', line_items: [{ description: 'b', quantity: 2, unit_price: 10 }] }

const draftInvoice = (o: Partial<NormalizedInvoice> = {}) => inv(o)
const sentInvoice = (o: Partial<NormalizedInvoice> = {}) =>
  inv({ lifecycle: 'sent', number: 'BRW-1042', sent_at: '2026-08-01T00:00:00.000Z', versions: [v1], ...o })

describe('InvoiceEditorClient — document', () => {
  it('draft shows "№ assigned when sent" and no number input', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={draftInvoice()} />)
    expect(screen.getByText(/assigned when sent/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/invoice number/i)).not.toBeInTheDocument()
  })

  it('sent invoice shows its assigned number', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={sentInvoice()} />)
    expect(screen.getByText(/BRW-1042/)).toBeInTheDocument()
  })

  it('renders line-item rows with a trash icon button, not a Remove text button', () => {
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({ line_items: [{ description: 'Coffee bar', quantity: 1, unit_price: 650 }] })} />,
    )
    expect(screen.getAllByRole('button', { name: /remove line/i })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()
  })

  it('shows totals in reading order with an inline discount reason input', async () => {
    const user = userEvent.setup()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({ line_items: [{ description: 'Service', quantity: 1, unit_price: 1000 }] })} />,
    )
    await user.selectOptions(screen.getByLabelText('Discount'), 'percent')
    await user.clear(screen.getByLabelText('Value'))
    await user.type(screen.getByLabelText('Value'), '10')
    await user.type(screen.getByLabelText(/reason/i), 'Returning customer')
    expect(screen.getByTestId('breakdown-discount')).toHaveTextContent('100.00')
    expect(screen.getByLabelText(/reason/i)).toHaveValue('Returning customer')
  })

  it('Send invoice opens the dialog pre-filled with the customer email and calls sendInvoice', async () => {
    const user = userEvent.setup()
    sendInvoiceMock.mockClear()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" customerEmail="c@e.com"
        invoice={draftInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: /send invoice/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/^to$/i)).toHaveValue('c@e.com')
    await user.click(within(dialog).getByRole('button', { name: /send invoice/i }))
    expect(sendInvoiceMock).toHaveBeenCalledWith('org1', 'inv1', expect.objectContaining({ to: 'c@e.com' }))
  })

  it('sent invoice is read-only until Edit invoice is clicked, then CTA becomes Send update', async () => {
    const user = userEvent.setup()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />,
    )
    expect((screen.getByDisplayValue('x') as HTMLInputElement).readOnly).toBe(true)
    await user.click(screen.getByRole('button', { name: /edit invoice/i }))
    expect((screen.getByDisplayValue('x') as HTMLInputElement).readOnly).toBe(false)
    expect(screen.getByRole('button', { name: /send update/i })).toBeInTheDocument()
  })

  it('sent invoice shows version history disclosure with one entry per send', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={sentInvoice({ versions: [v1, v2] })} />)
    expect(screen.getAllByTestId('history-entry')).toHaveLength(2)
  })

  it('shows the tip field when tips resolve to enabled', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" orgTipsEnabled invoice={draftInvoice({ tips_enabled: true })} />)
    expect(screen.getByLabelText(/tip/i)).toBeInTheDocument()
  })

  it('hides the tip field when tips resolve to off (per-invoice override)', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" orgTipsEnabled invoice={draftInvoice({ tips_enabled: false })} />)
    expect(screen.queryByLabelText(/tip/i)).not.toBeInTheDocument()
  })

  it('shows "Bill to" with the customer name when provided', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" customerName="Acme Corp" invoice={draftInvoice({ customer_id: 'cust-9' })} />)
    expect(screen.getByText(/bill to/i)).toBeInTheDocument()
    expect(screen.getByText(/acme corp/i)).toBeInTheDocument()
  })

  it('computes the totals math for an invoice with discount + tax', () => {
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({
          discount: { type: 'percent', value: 10 }, tax_rate: 10,
          line_items: [{ description: 'Service', quantity: 1, unit_price: 1000 }],
        })} />,
    )
    expect(screen.getByTestId('breakdown-subtotal')).toHaveTextContent('1000.00')
    expect(screen.getByTestId('breakdown-discount')).toHaveTextContent('100.00')
    expect(screen.getByTestId('breakdown-tax')).toHaveTextContent('90.00')
    expect(screen.getByTestId('breakdown-total')).toHaveTextContent('990.00')
  })

  it('disables the discount/tax/taxable inputs once sent', () => {
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({
          discount: { type: 'percent', value: 10 }, tax_rate: 10,
          line_items: [{ description: 'x', quantity: 1, unit_price: 10 }],
        })} />,
    )
    expect((screen.getByLabelText('Discount') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText('Value') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText(/tax rate/i) as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByLabelText(/taxable/i) as HTMLInputElement).disabled).toBe(true)
  })
})

// --- composition invariants (screen-composition checklist) ---
describe('InvoiceEditorClient — composition invariants', () => {
  const withPayment = () =>
    sentInvoice({
      line_items: [{ description: 'x', quantity: 1, unit_price: 100 }],
      payments: [{ amount: 40, recorded_at: '2026-08-02T00:00:00.000Z' }],
    })

  it('renders Balance exactly once on the page', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={withPayment()} />)
    expect(screen.getAllByTestId('breakdown-balance')).toHaveLength(1)
    expect(screen.queryByText(/balance due/i)).not.toBeInTheDocument()
  })

  it('renders Amount paid exactly once on the page', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={withPayment()} />)
    expect(screen.getAllByText(/^Amount paid$/i)).toHaveLength(1)
  })

  it('gives Balance visual dominance over the supporting totals lines', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={withPayment()} />)
    expect(screen.getByTestId('breakdown-balance').className).toMatch(/text-2xl/)
    for (const id of ['breakdown-subtotal', 'breakdown-total', 'breakdown-paid']) {
      expect(screen.getByTestId(id).className).not.toMatch(/text-2xl/)
    }
  })

  it('shows an interpretation line under Balance for each payment state', () => {
    const { unmount: u1 } = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({
          line_items: [{ description: 'x', quantity: 1, unit_price: 100 }],
          payments: [{ amount: 100, recorded_at: '2026-08-02T00:00:00.000Z' }],
        })} />,
    )
    expect(screen.getByTestId('balance-note')).toHaveTextContent(/paid in full/i)
    u1()

    const { unmount: u2 } = render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={withPayment()} />)
    expect(screen.getByTestId('balance-note')).toHaveTextContent(/\$40\.00 of \$100\.00 paid/i)
    u2()

    const { unmount: u3 } = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ due_date: '2020-01-01', line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    expect(screen.getByTestId('balance-note')).toHaveTextContent(/overdue/i)
    u3()

    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    expect(screen.getByTestId('balance-note')).toHaveTextContent(/not sent yet/i)
  })

  it('renders an empty-state line instead of an empty table when there are no line items', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={draftInvoice({ line_items: [] })} />)
    expect(screen.getByText(/no line items yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId('line-item-row')).not.toBeInTheDocument()
  })

  it('omits the History disclosure entirely when there are no versions', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={sentInvoice({ versions: [] })} />)
    expect(screen.queryByText(/^History$/i)).not.toBeInTheDocument()
  })
})
