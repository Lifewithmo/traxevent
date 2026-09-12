import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import userEvent from '@testing-library/user-event'
import { InvoiceEditorClient } from '@/components/admin/InvoiceEditorClient'
import type { NormalizedInvoice, InvoiceVersion } from '@/lib/types'

const refreshSpy = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: refreshSpy }) }))

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
const voidInvoiceMock = vi.fn(async (_orgId: string, _invoiceId: string) => {})
vi.mock('@/actions/invoices', () => ({
  recordPayment: vi.fn(), deleteInvoice: vi.fn(),
  voidInvoice: (...args: Parameters<typeof voidInvoiceMock>) => voidInvoiceMock(...args),
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

  it('renders Balance exactly once on the page, with the right figure', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={withPayment()} />)
    expect(screen.getAllByTestId('breakdown-balance')).toHaveLength(1)
    expect(screen.queryByText(/balance due/i)).not.toBeInTheDocument()
    // Counting the node is not enough — pin the value, or the math could regress
    // while every invariant above still passes. 100 total − 40 paid = 60.
    expect(screen.getByTestId('breakdown-balance')).toHaveTextContent('$60.00')
    expect(screen.getByTestId('breakdown-paid')).toHaveTextContent('$40.00')
    expect(screen.getByTestId('breakdown-total')).toHaveTextContent('$100.00')
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

// --- shared UI kit: StatusPill, EmptyState, overflow Menu, ConfirmDialog ---
describe('InvoiceEditorClient — kit surfaces', () => {
  const pillOf = (container: HTMLElement) => container.querySelector('[data-slot="status-pill"]')

  it('reads the money state off the pill, not just the lifecycle', () => {
    const paid = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({
          line_items: [{ description: 'x', quantity: 1, unit_price: 100 }],
          payments: [{ amount: 100, recorded_at: '2026-08-02T00:00:00.000Z' }],
        })} />,
    )
    expect(pillOf(paid.container)).toHaveTextContent('Paid')
    expect(pillOf(paid.container)?.className).toMatch(/status-confirmed/)
    paid.unmount()

    const overdue = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ due_date: '2020-01-01', line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    expect(pillOf(overdue.container)).toHaveTextContent('Overdue')
    expect(pillOf(overdue.container)?.className).toMatch(/status-alert/)
    overdue.unmount()

    const partial = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({
          line_items: [{ description: 'x', quantity: 1, unit_price: 100 }],
          payments: [{ amount: 40, recorded_at: '2026-08-02T00:00:00.000Z' }],
        })} />,
    )
    expect(pillOf(partial.container)).toHaveTextContent('Partial')
    partial.unmount()

    const draft = render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={draftInvoice()} />)
    expect(pillOf(draft.container)).toHaveTextContent('Draft')
    expect(pillOf(draft.container)?.className).toMatch(/status-neutral/)
  })

  it('void reads as Void on the pill, never as overdue', () => {
    const { container } = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={inv({ lifecycle: 'void', due_date: '2020-01-01', line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    expect(pillOf(container)).toHaveTextContent('Void')
  })

  it('the empty line-items state carries its own CTA while editable', () => {
    const { container } = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={draftInvoice({ line_items: [] })} />,
    )
    const empty = container.querySelector('[data-slot="empty-state"]') as HTMLElement
    expect(empty).toHaveTextContent(/no line items yet/i)
    expect(within(empty).getByRole('button', { name: /add from catalog/i })).toBeInTheDocument()
    expect(within(empty).getByRole('button', { name: /add blank line/i })).toBeInTheDocument()
  })

  // The old copy said "add one below" while the controls it pointed at were
  // gated on !locked — a locked empty invoice aimed the operator at nothing.
  it('offers no dead CTA when the empty invoice is locked', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={sentInvoice({ line_items: [] })} />)
    expect(screen.getByText(/no line items yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add from catalog/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add blank line/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/add one below/i)).not.toBeInTheDocument()
  })

  it('the payments empty state points at the amount field, and offers nothing on a void invoice', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    expect(screen.getByText(/no payments yet/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /record the first payment/i }))
    expect(screen.getByLabelText('Amount')).toHaveFocus()
    unmount()

    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={inv({ lifecycle: 'void', line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    expect(screen.getByText(/no payments yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record the first payment/i })).not.toBeInTheDocument()
  })

  it('keeps the destructive actions in the overflow, scoped to the lifecycle', async () => {
    const user = userEvent.setup()
    const sent = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: /void invoice/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /delete invoice/i })).not.toBeInTheDocument()
    sent.unmount()

    const draft = render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={draftInvoice()} />)
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: /delete invoice/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /void invoice/i })).not.toBeInTheDocument()
    draft.unmount()

    // Neither action applies to a voided invoice, so the trigger itself is gone.
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={inv({ lifecycle: 'void' })} />)
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
  })

  it('Void goes through an in-app ConfirmDialog, and cancelling voids nothing', async () => {
    const user = userEvent.setup()
    voidInvoiceMock.mockClear()
    // The old guard was window.confirm — unstyled, blocking, and untestable.
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: /void invoice/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/void this invoice\?/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument()
    expect(nativeConfirm).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(voidInvoiceMock).not.toHaveBeenCalled()
    nativeConfirm.mockRestore()
  })

  it('confirming the dialog is what actually voids the invoice', async () => {
    const user = userEvent.setup()
    voidInvoiceMock.mockClear()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: /void invoice/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /void invoice/i }))

    expect(voidInvoiceMock).toHaveBeenCalledWith('org1', 'inv1')
    expect(await screen.findByText(/invoice voided/i)).toBeInTheDocument()
  })

  // The in-flight verb used to sit on the action bar itself. Moving Void into the
  // overflow moved its label behind a closed menu, so the toolbar looked idle for
  // the whole request — the one moment the operator most needs to be told to wait.
  it('shows the void in flight on the closed toolbar, not only inside the menu', async () => {
    const user = userEvent.setup()
    voidInvoiceMock.mockClear()
    let release: () => void = () => {}
    voidInvoiceMock.mockImplementationOnce(() => new Promise<void>((res) => { release = res }))
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: /void invoice/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /void invoice/i }))

    // Menu is closed at this point, so this label can only be the toolbar's.
    expect(await screen.findByText('Voiding…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeDisabled()

    release()
    expect(await screen.findByText(/invoice voided/i)).toBeInTheDocument()
    expect(screen.queryByText('Voiding…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).not.toBeDisabled()
  })

  // The kit brick guards this, but the call site must not depend on that alone:
  // handleVoid is re-entrant through any path that can fire it twice.
  it('voids once even if the confirmed action is fired twice', async () => {
    const user = userEvent.setup()
    voidInvoiceMock.mockClear()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={sentInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 100 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: /void invoice/i }))
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: /void invoice/i })
    await act(async () => { confirm.click(); confirm.click() })

    expect(voidInvoiceMock).toHaveBeenCalledTimes(1)
  })
})

describe('InvoiceEditorClient — void lifecycle', () => {
  const voidInvoice = () =>
    inv({
      lifecycle: 'void', number: 'BRW-1042', due_date: '2020-01-01',
      line_items: [{ description: 'x', quantity: 1, unit_price: 100 }],
    })

  it('reads as voided rather than overdue, and not in destructive red', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={voidInvoice()} />)
    const note = screen.getByTestId('balance-note')
    expect(note).toHaveTextContent(/voided/i)
    expect(note).not.toHaveTextContent(/overdue/i)
    expect(note.className).not.toMatch(/text-destructive/)
  })

  it('offers no way to edit, save, send, or take payment', () => {
    render(<InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={voidInvoice()} />)
    expect(screen.queryByRole('button', { name: /edit invoice/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send (invoice|update)/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument()
    expect((screen.getByDisplayValue('x') as HTMLInputElement).readOnly).toBe(true)
  })
})

describe('InvoiceEditorClient — failure and in-flight paths', () => {
  it('surfaces the failure message when Save rejects', async () => {
    const user = userEvent.setup()
    updateInvoiceMock.mockClear()
    updateInvoiceMock.mockRejectedValueOnce(new Error('Invoice is locked'))
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({ line_items: [{ description: 'Service', quantity: 1, unit_price: 1000 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    expect(await screen.findByText(/invoice is locked/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Saved\.$/)).not.toBeInTheDocument()
  })

  // sendInvoice can commit the number and lifecycle and still throw afterwards; without a
  // refresh the editor keeps showing Draft chrome for an invoice that is already sent.
  it('refreshes even when the send rejects, so stale Draft chrome cannot persist', async () => {
    const user = userEvent.setup()
    refreshSpy.mockClear()
    sendInvoiceMock.mockClear()
    sendInvoiceMock.mockRejectedValueOnce(new Error('delivery status write failed'))
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" customerEmail="c@e.com"
        invoice={draftInvoice({ line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: /send invoice/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /send invoice/i }))
    expect(await within(dialog).findByText(/delivery status write failed/i)).toBeInTheDocument()
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('keeps edits typed while a save is in flight', async () => {
    const user = userEvent.setup()
    updateInvoiceMock.mockClear()
    let release: () => void = () => {}
    updateInvoiceMock.mockImplementationOnce(() => new Promise<void>((res) => { release = res }))
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({ line_items: [{ description: 'Old', quantity: 1, unit_price: 10 }] })} />,
    )
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    await user.type(screen.getByLabelText('Description'), ' and new')
    release()
    expect(await screen.findByText(/^Saved\.$/)).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toHaveValue('Old and new')
  })

  it('keeps the discount reason when only the discount type changes', async () => {
    const user = userEvent.setup()
    render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        invoice={draftInvoice({
          discount: { type: 'percent', value: 10, reason: 'Returning customer' },
          line_items: [{ description: 'Service', quantity: 1, unit_price: 1000 }],
        })} />,
    )
    expect(screen.getByLabelText(/reason/i)).toHaveValue('Returning customer')
    await user.selectOptions(screen.getByLabelText('Discount'), 'fixed')
    expect(screen.getByLabelText(/reason/i)).toHaveValue('Returning customer')
  })

  it('renders the org letterhead from branding', () => {
    const { container } = render(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
        branding={{ display_name: 'BrewTrax', address: '12 Main St\nBoise, ID', logo_url: 'https://cdn.test/logo.png' }}
        invoice={draftInvoice()} />,
    )
    expect(screen.getByText('BrewTrax')).toBeInTheDocument()
    expect(screen.getByText(/12 Main St/)).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/logo.png')
  })
})

// --- zone-safe date stamps (the /checkin SSR hydration crash class, PR #134) ---

describe('InvoiceEditorClient — date stamps are viewer-local without a hydration crash', () => {
  // Instants that straddle a UTC date boundary for any US viewer: a UTC server
  // and a stateside browser disagree on the calendar date of both.
  const SENT_AT = '2026-08-13T02:30:00.000Z'
  const RECORDED_AT = '2026-08-20T03:15:00.000Z'
  // Computed through the same Intl surface in the test env's own zone —
  // whatever TZ this run has, the stamps must agree with it after hydration.
  const localDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const hydInvoice = () =>
    inv({
      lifecycle: 'sent', number: 'BRW-1042', sent_at: SENT_AT,
      line_items: [{ description: 'Coffee bar', quantity: 1, unit_price: 650 }],
      payments: [{ amount: 100, method: 'card', recorded_at: RECORDED_AT }],
      versions: [{ sent_at: SENT_AT, line_items: [{ description: 'Coffee bar', quantity: 1, unit_price: 650 }] }],
    })

  it('SSR bakes NO date face into the Sent/payment/history stamps — placeholder until hydration', () => {
    const html = renderToString(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={hydInvoice()} />,
    )
    // The defect class: the server's formatted dates landed in the HTML, the
    // browser's hydration pass formatted the viewer's own zone instead, and
    // React aborted with minified error #418 — every button dead. The server
    // pass must emit only the placeholder; in this test the "server" and the
    // viewer share a zone, so ANY date face in the SSR payload means it was
    // formatted server-side again.
    const text = html.replace(/<!-- -->/g, '')
    expect(text).toContain('Sent …')
    expect(html).not.toContain(localDate(SENT_AT))
    expect(html).not.toContain(localDate(RECORDED_AT))
    expect(html).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/) // the old default face
    // Zone-independent document content still SSRs.
    expect(text).toContain('BRW-1042')
    expect(text).toContain('$650.00')
  })

  it('hydrates the SSR HTML with zero console.error, then swaps in the viewer-local dates', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = renderToString(
      <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={hydInvoice()} />,
    )

    // No suppressHydrationWarning anywhere on the stamps, so a server/client
    // divergence would surface right here as a console.error from React.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(
        <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l" invoice={hydInvoice()} />,
        { container, hydrate: true },
      )
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }

    // Post-hydration: the genuine viewer-local faces.
    expect(screen.getByText(`Sent ${localDate(SENT_AT)}`)).toBeInTheDocument()
    expect(screen.getByText(localDate(RECORDED_AT))).toBeInTheDocument()
    expect(screen.getByTestId('history-entry')).toHaveTextContent(`Sent ${localDate(SENT_AT)}`)

    // And the handlers are ALIVE — the production symptom of this class was an
    // inert page (hydration aborted, nothing attached). Unlocking the sent
    // invoice must actually flip the CTA.
    fireEvent.click(screen.getByRole('button', { name: /edit invoice/i }))
    expect(screen.getByRole('button', { name: /send update/i })).toBeInTheDocument()

    container.remove()
  })

  // The balance note's overdue judgment is also SSR text: it must run on UTC
  // day math (lib/invoice-status.daysOverdue — the pill's aging convention),
  // never ambient-zone locals. A UTC server and a US-evening browser disagree
  // on "today" every evening, and the resulting SSR/client text mismatch is
  // this same #418 crash — plus the note contradicting the pill.
  it('judges overdue on UTC day math, not the render machine\'s zone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T02:30:00.000Z'))
    const prevTZ = process.env.TZ
    process.env.TZ = 'America/Denver'
    try {
      // 02:30 UTC on Aug 13 is 20:30 Aug 12 in Denver: ambient-zone math said
      // "Awaiting payment" (not overdue yet) while UTC day math says 1 day.
      render(
        <InvoiceEditorClient orgId="org1" orgSlug="s" leadId="l"
          invoice={sentInvoice({
            line_items: [{ description: 'x', quantity: 1, unit_price: 100 }],
            due_date: '2026-08-12',
          })} />,
      )
      expect(screen.getByTestId('balance-note')).toHaveTextContent('1 day overdue')
    } finally {
      if (prevTZ === undefined) delete process.env.TZ
      else process.env.TZ = prevTZ
      vi.useRealTimers()
    }
  })
})
