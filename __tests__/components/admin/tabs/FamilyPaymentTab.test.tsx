import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FamilyPaymentTab } from '@/components/admin/tabs/FamilyPaymentTab'
import type { Family } from '@/lib/types'

vi.mock('@/actions/admin-families', () => ({
  updateAdminFamily: vi.fn().mockResolvedValue(undefined),
}))

const mockFamily: Family = {
  id: 'fam-1',
  org_id: 'org-1',
  camp_id: 'camp-1',
  org_slug: 'acme',
  camp_slug: 'summer-2025',
  camp_name: 'Summer Camp',
  org_name: 'Acme',
  first_name: 'Lisa',
  last_name: 'Chen',
  email: 'lisa@example.com',
  phone: '555-1234',
  address: { street: '1 Main', city: 'SF', state: 'CA', zip: '94102' },
  emergency_contact: { name: 'David', phone: '555-5678', relationship: 'Spouse' },
  registration_status: 'pending',
  payment_status: 'unpaid',
  amount_due: 700,
  amount_paid: 0,
  payment_notes: '',
  registrant_uid: null,
  pco_household_id: null,
  access_token: null,
  access_token_expires_at: null,
  created_at: '2025-05-12T10:00:00Z',
  updated_at: '2025-05-12T10:00:00Z',
  notes: [],
}

describe('FamilyPaymentTab', () => {
  it('shows the correct balance (amount_due minus amount_paid)', () => {
    render(
      <FamilyPaymentTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByText('$700.00')).toBeInTheDocument()
  })

  it('shows zero balance when fully paid', () => {
    render(
      <FamilyPaymentTab
        family={{ ...mockFamily, amount_paid: 700 }}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('calls updateAdminFamily when Save is clicked after editing', async () => {
    const { updateAdminFamily } = await import('@/actions/admin-families')
    render(
      <FamilyPaymentTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    const amountPaidInput = screen.getByLabelText(/amount paid/i)
    await userEvent.clear(amountPaidInput)
    await userEvent.type(amountPaidInput, '350')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() =>
      expect(updateAdminFamily).toHaveBeenCalledWith(
        'org-1', 'camp-1', 'fam-1',
        expect.objectContaining({ amount_paid: 350 })
      )
    )
  })
})
