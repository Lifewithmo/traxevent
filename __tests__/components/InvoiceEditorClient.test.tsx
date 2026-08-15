import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvoiceEditorClient } from '@/components/admin/InvoiceEditorClient'
import type { NormalizedInvoice } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/actions/invoices', () => ({
  updateInvoice: vi.fn(), issueInvoice: vi.fn(), voidInvoice: vi.fn(),
  recordPayment: vi.fn(), deleteInvoice: vi.fn(),
}))

const inv = (o: Partial<NormalizedInvoice>): NormalizedInvoice => ({
  id: 'i', org_id: 'o', lead_id: 'l', token: 't', type: 'quick', lifecycle: 'draft',
  delivery: 'not_sent', accounting: 'not_connected', dispute: 'none',
  line_items: [], payments: [], created_at: '', ...o,
})

describe('InvoiceEditorClient', () => {
  it('shows the tip field when tips resolve to enabled', () => {
    render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" orgTipsEnabled invoice={inv({ tips_enabled: true })} />)
    expect(screen.getByLabelText(/tip/i)).toBeInTheDocument()
  })
  it('hides the tip field when tips resolve to off (per-invoice override)', () => {
    render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" orgTipsEnabled invoice={inv({ tips_enabled: false })} />)
    expect(screen.queryByLabelText(/tip/i)).not.toBeInTheDocument()
  })
  it('renders line-item fields read-only once sent', () => {
    render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" invoice={inv({ lifecycle: 'sent', line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />)
    expect((screen.getByDisplayValue('x') as HTMLInputElement).readOnly).toBe(true)
  })
  it('shows "Bill to" with the customer name when provided', () => {
    render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" customerName="Acme Corp" invoice={inv({ customer_id: 'cust-9' })} />)
    expect(screen.getByText(/bill to/i)).toBeInTheDocument()
    expect(screen.getByText(/acme corp/i)).toBeInTheDocument()
  })
  it('renders no "Bill to" line when customerName is absent', () => {
    render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" invoice={inv({})} />)
    expect(screen.queryByText(/bill to/i)).not.toBeInTheDocument()
  })

  it('breakdown panel shows Subtotal/Discount/Tax/Total for an invoice with discount + tax', () => {
    render(
      <InvoiceEditorClient
        orgId="o" orgSlug="s" leadId="l"
        invoice={inv({
          discount: { type: 'percent', value: 10 },
          tax_rate: 10,
          line_items: [{ description: 'Service', quantity: 1, unit_price: 1000 }],
        })}
      />,
    )
    expect(screen.getByTestId('breakdown-subtotal')).toHaveTextContent('1000.00')
    expect(screen.getByTestId('breakdown-discount')).toHaveTextContent('100.00')
    expect(screen.getByTestId('breakdown-tax')).toHaveTextContent('90.00')
    // subtotal 1000, -10% discount = 900, +10% tax = 990
    expect(screen.getByTestId('breakdown-total')).toHaveTextContent('990.00')
  })

  it('disables the discount/tax/taxable inputs once sent', () => {
    render(
      <InvoiceEditorClient
        orgId="o" orgSlug="s" leadId="l"
        invoice={inv({
          lifecycle: 'sent',
          discount: { type: 'percent', value: 10 },
          tax_rate: 10,
          line_items: [{ description: 'x', quantity: 1, unit_price: 10 }],
        })}
      />,
    )
    expect((screen.getByLabelText('Discount') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText('Value') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText(/tax rate/i) as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByLabelText(/taxable/i) as HTMLInputElement).disabled).toBe(true)
  })
})
