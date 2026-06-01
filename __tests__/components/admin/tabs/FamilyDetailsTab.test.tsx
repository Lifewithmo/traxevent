import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FamilyDetailsTab } from '@/components/admin/tabs/FamilyDetailsTab'
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
  registrant_uid: null,
  pco_household_id: null,
  access_token: null,
  access_token_expires_at: null,
  created_at: '2025-05-12T10:00:00Z',
  updated_at: '2025-05-12T10:00:00Z',
  notes: [],
}

describe('FamilyDetailsTab', () => {
  it('renders the family contact fields', () => {
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue('Lisa')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Chen')).toBeInTheDocument()
    expect(screen.getByDisplayValue('lisa@example.com')).toBeInTheDocument()
  })

  it('does not show Save button when fields are clean', () => {
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })

  it('shows Save button after editing a field', async () => {
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    const firstNameInput = screen.getByDisplayValue('Lisa')
    await userEvent.clear(firstNameInput)
    await userEvent.type(firstNameInput, 'Lucy')
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('calls updateAdminFamily with changed fields when Save is clicked', async () => {
    const { updateAdminFamily } = await import('@/actions/admin-families')
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={vi.fn()}
      />
    )
    const firstNameInput = screen.getByDisplayValue('Lisa')
    await userEvent.clear(firstNameInput)
    await userEvent.type(firstNameInput, 'Lucy')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() =>
      expect(updateAdminFamily).toHaveBeenCalledWith(
        'org-1', 'camp-1', 'fam-1',
        expect.objectContaining({ first_name: 'Lucy' })
      )
    )
  })

  it('hides Save button and calls onSaved after successful save', async () => {
    const onSaved = vi.fn()
    render(
      <FamilyDetailsTab
        family={mockFamily}
        orgId="org-1"
        campId="camp-1"
        onSaved={onSaved}
      />
    )
    const firstNameInput = screen.getByDisplayValue('Lisa')
    await userEvent.clear(firstNameInput)
    await userEvent.type(firstNameInput, 'Lucy')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })
})
