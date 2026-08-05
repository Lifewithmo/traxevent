import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvoiceEditorClient } from '@/components/admin/InvoiceEditorClient'
import type { NormalizedInvoice } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/actions/invoices', () => ({
  updateInvoice: vi.fn(), issueInvoice: vi.fn(), voidInvoice: vi.fn(),
  replaceInvoice: vi.fn(), approveInvoice: vi.fn(), recordPayment: vi.fn(), deleteInvoice: vi.fn(),
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
  it('renders line-item fields read-only once issued', () => {
    render(<InvoiceEditorClient orgId="o" orgSlug="s" leadId="l" invoice={inv({ lifecycle: 'issued', line_items: [{ description: 'x', quantity: 1, unit_price: 10 }] })} />)
    expect((screen.getByDisplayValue('x') as HTMLInputElement).readOnly).toBe(true)
  })
})
