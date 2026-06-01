import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FamilySlideOver } from '@/components/admin/FamilySlideOver'
import type { Family, FamilyMember } from '@/lib/types'

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

const mockMember: FamilyMember = {
  id: 'mem-1',
  family_id: 'fam-1',
  first_name: 'Mia',
  last_name: 'Chen',
  birth_year: 2015,
  gender: 'F',
  grade: '4th',
  allergies: 'peanuts',
  dietary_restrictions: '',
  tshirt_size: 'M',
  medical_notes: '',
}

vi.mock('@/actions/admin-families', () => ({
  getAdminFamily: vi.fn().mockResolvedValue({
    family: {
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
    },
    members: [
      {
        id: 'mem-1',
        family_id: 'fam-1',
        first_name: 'Mia',
        last_name: 'Chen',
        birth_year: 2015,
        gender: 'F',
        grade: '4th',
        allergies: 'peanuts',
        dietary_restrictions: '',
        tshirt_size: 'M',
        medical_notes: '',
      },
    ],
  }),
  updateFamilyStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/components/admin/tabs/FamilyDetailsTab', () => ({
  FamilyDetailsTab: () => <div>Details tab</div>,
}))
vi.mock('@/components/admin/tabs/FamilyCampersTab', () => ({
  FamilyCampersTab: () => <div>Campers tab</div>,
}))
vi.mock('@/components/admin/tabs/FamilyPaymentTab', () => ({
  FamilyPaymentTab: () => <div>Payment tab</div>,
}))
vi.mock('@/components/admin/tabs/FamilyNotesTab', () => ({
  FamilyNotesTab: () => <div>Notes tab</div>,
}))

const mockFamilies = [
  mockFamily,
  { ...mockFamily, id: 'fam-2', first_name: 'Bob', last_name: 'Smith' },
]

function renderSlideOver(overrides = {}) {
  return render(
    <FamilySlideOver
      familyId="fam-1"
      families={mockFamilies}
      orgId="org-1"
      campId="camp-1"
      onClose={vi.fn()}
      onNavigate={vi.fn()}
      onStatusChange={vi.fn()}
      {...overrides}
    />
  )
}

describe('FamilySlideOver', () => {
  it('renders null when familyId is null', () => {
    const { container } = render(
      <FamilySlideOver
        familyId={null}
        families={mockFamilies}
        orgId="org-1"
        campId="camp-1"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onStatusChange={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows family name in header after loading', async () => {
    renderSlideOver()
    await waitFor(() => expect(screen.getByText('Chen, Lisa')).toBeInTheDocument())
  })

  it('calls onClose when ✕ button is clicked', async () => {
    const onClose = vi.fn()
    renderSlideOver({ onClose })
    await waitFor(() => screen.getByText('Chen, Lisa'))
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the Details tab by default', async () => {
    renderSlideOver()
    await waitFor(() => screen.getByText('Chen, Lisa'))
    expect(screen.getByRole('tab', { name: /details/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to Notes tab when clicked', async () => {
    renderSlideOver()
    await waitFor(() => screen.getByText('Chen, Lisa'))
    await userEvent.click(screen.getByRole('tab', { name: /notes/i }))
    expect(screen.getByRole('tab', { name: /notes/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('calls onNavigate with next family id when Next is clicked', async () => {
    const onNavigate = vi.fn()
    renderSlideOver({ onNavigate })
    await waitFor(() => screen.getByText('Chen, Lisa'))
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNavigate).toHaveBeenCalledWith('fam-2')
  })

  it('Prev button is disabled for first family in list', async () => {
    renderSlideOver()
    await waitFor(() => screen.getByText('Chen, Lisa'))
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled()
  })

  it('calls onStatusChange with confirmed when Confirm is clicked', async () => {
    const onStatusChange = vi.fn()
    renderSlideOver({ onStatusChange })
    await waitFor(() => screen.getByText('Chen, Lisa'))
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(onStatusChange).toHaveBeenCalledWith('fam-1', 'confirmed')
  })
})
