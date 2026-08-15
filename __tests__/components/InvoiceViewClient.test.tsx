import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvoiceViewClient } from '@/components/invoices/InvoiceViewClient'
import type { PublicInvoice } from '@/actions/invoices-public'

const inv = (o: Partial<PublicInvoice>): PublicInvoice => ({
  type: 'quick',
  line_items: [{ description: 'Catering', quantity: 1, unit_price: 100 }],
  subtotal: 100,
  discount_amount: 0,
  tax_amount: 0,
  credits: [],
  total: 100,
  amount_paid: 0,
  balance: 100,
  tips_enabled: false,
  created_at: '2026-08-01T00:00:00.000Z',
  ...o,
})

describe('InvoiceViewClient', () => {
  it('renders the heading with the invoice number', () => {
    render(<InvoiceViewClient invoice={inv({ number: 'INV-001' })} />)
    expect(screen.getByRole('heading', { name: /invoice #inv-001/i })).toBeInTheDocument()
  })

  it('renders the from and bill-to names', () => {
    render(
      <InvoiceViewClient
        invoice={inv({
          from: { name: 'BrewTrax', address: '1 Keg Ln' },
          bill_to: { name: 'Dana Kim', company: 'Riverside' },
        })}
      />,
    )
    expect(screen.getByText('BrewTrax')).toBeInTheDocument()
    expect(screen.getByText('Dana Kim')).toBeInTheDocument()
  })

  it('shows the discount reason on the totals line', () => {
    render(
      <InvoiceViewClient
        invoice={inv({
          discount: { type: 'percent', value: 10, reason: 'Returning customer' },
          discount_amount: 10,
        })}
      />,
    )
    expect(screen.getByText(/discount — returning customer/i)).toBeInTheDocument()
  })

  it('shows the Paid chip when balance is zero', () => {
    render(<InvoiceViewClient invoice={inv({ amount_paid: 100, balance: 0 })} />)
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('does not show the Paid chip when a balance remains', () => {
    render(<InvoiceViewClient invoice={inv({ balance: 100 })} />)
    expect(screen.queryByText('Paid')).not.toBeInTheDocument()
  })

  // --- composition invariants (screen-composition checklist) ---

  it('renders the balance figure exactly once, with the right value', () => {
    render(<InvoiceViewClient invoice={inv({ amount_paid: 40, balance: 60 })} />)
    expect(screen.getAllByTestId('public-balance')).toHaveLength(1)
    expect(screen.getAllByText(/^Balance due$/i)).toHaveLength(1)
    // The old layout repeated it as "Balance due: $60.00" beneath the totals block.
    expect(screen.queryByText(/Balance due:/i)).not.toBeInTheDocument()
    // Counting the node proves it is not duplicated; this proves it is correct.
    expect(screen.getByTestId('public-balance')).toHaveTextContent('$60.00')
  })

  it('gives the balance visual dominance over the supporting totals lines', () => {
    const { container } = render(<InvoiceViewClient invoice={inv({ balance: 60 })} />)
    expect(screen.getByTestId('public-balance').className).toMatch(/text-2xl/)
    expect(container.querySelectorAll('.text-2xl')).toHaveLength(1)
  })

  it('reads "Paid in full" when nothing is owed', () => {
    render(<InvoiceViewClient invoice={inv({ amount_paid: 100, balance: 0 })} />)
    expect(screen.getByTestId('public-balance-note')).toHaveTextContent(/paid in full/i)
  })

  it('reads as overdue when the due date has passed and a balance remains', () => {
    render(<InvoiceViewClient invoice={inv({ balance: 100, due_date: '2020-01-01' })} />)
    expect(screen.getByTestId('public-balance-note')).toHaveTextContent(/overdue/i)
  })

  it('reads the note relatively when the due date is still ahead, without repeating the date', () => {
    render(<InvoiceViewClient invoice={inv({ balance: 100, due_date: '2099-01-01' })} />)
    expect(screen.getByTestId('public-balance-note')).toHaveTextContent(/due in \d+ days?/i)
    // The header already carries the date; the note interprets rather than repeats it.
    expect(screen.getAllByText(/2099-01-01/)).toHaveLength(1)
  })

  it('drops the line-items table entirely when there are none, rather than stranding headers', () => {
    render(<InvoiceViewClient invoice={inv({ line_items: [], subtotal: 0, total: 0, balance: 0 })} />)
    expect(screen.queryByTestId('invoice-line-items')).not.toBeInTheDocument()
    expect(screen.queryByText('Unit price')).not.toBeInTheDocument()
  })

  // jsdom cannot measure overflow, so pin the mechanism structurally: money renders as
  // unbreakable tokens, so the 4-column table must scroll inside its own container
  // rather than pushing the page sideways at 375px.
  it('confines the line-items table to its own scroll container and tightens the sheet on mobile', () => {
    const { container } = render(<InvoiceViewClient invoice={inv({})} />)
    expect(screen.getByTestId('invoice-line-items').parentElement?.className).toMatch(/overflow-x-auto/)
    expect(container.querySelector('.invoice-document')?.className).toMatch(/max-md:px-5/)
  })
})
