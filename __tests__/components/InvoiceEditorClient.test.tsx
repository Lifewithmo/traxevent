import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvoiceEditorClient } from '@/components/admin/InvoiceEditorClient'
import type { NormalizedInvoice, InvoiceVersion } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

type Discount = { type: string; value: number; reason?: string }
type UpdatePayload = {
  title?: string; due_date?: string; notes?: string
  line_items?: unknown[]; discount?: Discount; tax_rate?: number
}
type SendInput = { to: string; message?: string; updates?: UpdatePayload }
const sendInvoiceMock = vi.fn(
  async (_orgId: string, _invoiceId: string, _input: SendInput) => ({ number: 'BRW-1042', emailDelivered: true }),
)
const updateInvoiceMock = vi.fn(async (_orgId: string, _invoiceId: string, _updates: UpdatePayload) => {})
vi.mock('@/actions/invoices', () => ({
  voidInvoice: vi.fn(), recordPayment: vi.fn(), deleteInvoice: vi.fn(),
  sendInvoice: (...args: Parameters<typeof sendInvoiceMock>) => sendInvoiceMock(...args),
  updateInvoice: (...args: Parameters<typeof updateInvoiceMock>) => updateInvoiceMock(...args),
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
    const { container } = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({ line_items: [{ description: 'Service', quantity: 1, unit_price: 1000 }] })} />,
    )
    expect(
      Array.from(container.querySelectorAll('[data-testid^="breakdown-"]')).map((n) => n.getAttribute('data-testid')),
    ).toEqual([
      'breakdown-subtotal', 'breakdown-discount', 'breakdown-tax',
      'breakdown-total', 'breakdown-paid', 'breakdown-balance',
    ])
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

  it('rides unsaved edits along with the send as `updates`', async () => {
    const user = userEvent.setup()
    sendInvoiceMock.mockClear()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" customerEmail="c@e.com"
        invoice={draftInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />,
    )
    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'Mobile bar')

    await user.click(screen.getByRole('button', { name: /send invoice/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /send invoice/i }))

    const input = sendInvoiceMock.mock.calls[0][2]
    expect(input.updates?.line_items).toEqual([{ description: 'Mobile bar', quantity: 1, unit_price: 10 }])
    expect(input.updates?.discount).toBeUndefined()
  })

  it('warns persistently when the send lands but the email does not', async () => {
    const user = userEvent.setup()
    sendInvoiceMock.mockClear()
    sendInvoiceMock.mockResolvedValueOnce({ number: 'BRW-1042', emailDelivered: false })
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" customerEmail="c@e.com"
        invoice={draftInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: /send invoice/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /send invoice/i }))
    expect(await screen.findByText(/email delivery failed/i)).toBeInTheDocument()
  })

  it('shows the delivery-failure warning from the persisted status, with no send this session', () => {
    sendInvoiceMock.mockClear()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ delivery: 'bounced', line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />,
    )
    expect(screen.getByText(/email delivery failed/i)).toBeInTheDocument()
    expect(sendInvoiceMock).not.toHaveBeenCalled()
  })

  it('keeps the standing delivery warning when a retry send throws', async () => {
    const user = userEvent.setup()
    sendInvoiceMock.mockClear()
    sendInvoiceMock.mockRejectedValueOnce(new Error('Recipient email is required'))
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" customerEmail="c@e.com"
        invoice={sentInvoice({ delivery: 'bounced', line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: /send update/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /send update/i }))

    expect(await within(dialog).findByText(/recipient email is required/i)).toBeInTheDocument()
    expect(screen.getByText(/email delivery failed/i)).toBeInTheDocument()
  })

  it('clears the delivery warning once a send succeeds', async () => {
    const user = userEvent.setup()
    sendInvoiceMock.mockClear()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" customerEmail="c@e.com"
        invoice={sentInvoice({ delivery: 'bounced', line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: /send update/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /send update/i }))

    expect(await screen.findByText(/update sent/i)).toBeInTheDocument()
    expect(screen.queryByText(/email delivery failed/i)).not.toBeInTheDocument()
  })

  it('offers Add from catalog and Add blank line while editable', async () => {
    const user = userEvent.setup()
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={draftInvoice({ line_items: [] })} />)
    expect(screen.getByRole('button', { name: /add from catalog/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add blank line/i }))
    expect(screen.getAllByTestId('line-item-row')).toHaveLength(1)
  })

  it('Save on a draft calls updateInvoice with the cleaned payload', async () => {
    const user = userEvent.setup()
    updateInvoiceMock.mockClear()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({ line_items: [{ description: 'Service', quantity: 1, unit_price: 1000 }] })} />,
    )
    // An added-but-untouched row must never reach Firestore, even though
    // addRow seeds its quantity to 1.
    await user.click(screen.getByRole('button', { name: /add blank line/i }))
    await user.click(screen.getByRole('button', { name: /^Save$/ }))

    expect(updateInvoiceMock).toHaveBeenCalledTimes(1)
    const [orgId, invoiceId, payload] = updateInvoiceMock.mock.calls[0]
    expect(orgId).toBe('org1')
    expect(invoiceId).toBe('inv1')
    expect(payload.line_items).toEqual([{ description: 'Service', quantity: 1, unit_price: 1000 }])
    expect(payload.discount).toBeUndefined()
    expect(payload.tax_rate).toBeUndefined()
  })

  it('keeps a partially filled row — only description-and-price-less rows are dropped', async () => {
    const user = userEvent.setup()
    updateInvoiceMock.mockClear()
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={draftInvoice({ line_items: [] })} />)

    await user.click(screen.getByRole('button', { name: /add blank line/i }))
    await user.type(screen.getByLabelText('Description'), 'Setup fee')
    await user.click(screen.getByRole('button', { name: /^Save$/ }))

    expect(updateInvoiceMock.mock.calls[0][2].line_items)
      .toEqual([{ description: 'Setup fee', quantity: 1, unit_price: 0 }])
  })

  it('offers no Save on a sent invoice, even in edit mode — sent edits go out via Send update', async () => {
    const user = userEvent.setup()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />,
    )
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /edit invoice/i }))
    // updateInvoice would throw InvoiceLockedError on every financial key this
    // payload carries, so the button must not exist to be pressed.
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send update/i })).toBeInTheDocument()
  })

  it('trims the discount reason and omits the key entirely when it is blank', async () => {
    const user = userEvent.setup()
    updateInvoiceMock.mockClear()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({
          discount: { type: 'percent', value: 10, reason: 'Loyalty' },
          line_items: [{ description: 'Service', quantity: 1, unit_price: 1000 }],
        })} />,
    )

    await user.clear(screen.getByLabelText(/reason/i))
    await user.type(screen.getByLabelText(/reason/i), '   Repeat client  ')
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    expect(updateInvoiceMock.mock.calls[0][2].discount).toEqual({ type: 'percent', value: 10, reason: 'Repeat client' })

    // Whitespace-only is the same as cleared: the key goes away rather than
    // persisting '' and rendering "Discount — " on the customer's document.
    updateInvoiceMock.mockClear()
    await user.clear(screen.getByLabelText(/reason/i))
    await user.type(screen.getByLabelText(/reason/i), '   ')
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    const saved = updateInvoiceMock.mock.calls[0][2].discount
    expect(saved).toEqual({ type: 'percent', value: 10 })
    // A nested `undefined` is what Firestore rejects — the key must be absent.
    expect(Object.keys(saved ?? {})).not.toContain('reason')
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
    const { container } = render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={withPayment()} />)
    expect(screen.getByTestId('breakdown-balance').className).toMatch(/text-2xl/)
    for (const id of ['breakdown-subtotal', 'breakdown-total', 'breakdown-paid']) {
      expect(screen.getByTestId(id).className).not.toMatch(/text-2xl/)
    }
    // Nothing else on the document may compete with it — not even the "Invoice" title.
    expect(container.querySelectorAll('.text-2xl')).toHaveLength(1)
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
