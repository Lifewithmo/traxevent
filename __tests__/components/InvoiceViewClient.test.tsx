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
})
