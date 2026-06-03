import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { RegistrationForm } from '@/components/registration/RegistrationForm'

vi.mock('@/actions/registrations', () => ({
  createRegistration: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: null,
    loading: false,
    orgId: null,
    orgSlug: null,
    role: null,
  }),
}))

vi.mock('@/actions/registrant-auth', () => ({
  getRegistrantProfile: vi.fn().mockResolvedValue(null),
}))

const mockCamp = {
  id: 'camp-1',
  name: 'Family Camp 2026',
  slug: 'family-camp-2026',
  year: 2026,
  status: 'active' as const,
  registration_type: 'family' as const,
  event_type_id: 'summer-camp',
  features: { accommodations: true, teams: true, budget: true, itinerary: true, communicate: true },
  camp_start: '2026-07-10',
  camp_end: '2026-07-13',
  created_at: '2026-01-01',
}

const mockOrg = {
  id: 'org-1',
  name: 'First Hills Fellowship',
  slug: 'firsthills',
  billing_status: 'active' as const,
  created_at: '2026-01-01',
}

const mockIndividualCamp = {
  id: 'camp-2',
  name: 'Grace Retreat 2026',
  slug: 'grace-retreat-2026',
  year: 2026,
  status: 'active' as const,
  registration_type: 'individual' as const,
  event_type_id: 'retreat',
  features: { accommodations: true, teams: true, budget: true, itinerary: true, communicate: true },
  camp_start: '2026-09-01',
  camp_end: '2026-09-03',
  created_at: '2026-01-01',
}

describe('RegistrationForm', () => {
  it('renders the first step heading', () => {
    render(<RegistrationForm camp={mockCamp} org={mockOrg} />)
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument()
    expect(screen.getByText(/Contact Information/i)).toBeInTheDocument()
  })

  it('shows Step 2 after completing Step 1', async () => {
    render(<RegistrationForm camp={mockCamp} org={mockOrg} />)
    await userEvent.type(screen.getByLabelText(/First name/i), 'Jane')
    await userEvent.type(screen.getByLabelText(/Last name/i), 'Smith')
    await userEvent.type(screen.getByLabelText(/Email/i), 'jane@example.com')
    await userEvent.type(screen.getAllByLabelText(/Phone/i)[0], '555-1234')
    const nameInputs = screen.getAllByLabelText(/Name/i)
    await userEvent.type(nameInputs[nameInputs.length - 1], 'Bob Smith')
    await userEvent.type(screen.getAllByLabelText(/Phone/i)[1], '555-9999')
    await userEvent.click(screen.getByRole('button', { name: /Next/i }))
    expect(screen.getByText(/Step 2 of 3/i)).toBeInTheDocument()
    // summer-camp terminology.memberPlural is "Campers"
    expect(screen.getByText(/Campers/i)).toBeInTheDocument()
  })

  it('shows Step 1 of 2 for individual event types (no members step)', () => {
    render(<RegistrationForm camp={mockIndividualCamp} org={mockOrg} />)
    expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument()
  })

  it('uses terminology memberPlural as members step label for summer-camp', () => {
    render(<RegistrationForm camp={mockCamp} org={mockOrg} />)
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument()
  })

  it('pre-fills contact fields from RegistrantProfile when user is logged in', async () => {
    const { useAuth } = await import('@/hooks/useAuth')
    const { getRegistrantProfile } = await import('@/actions/registrant-auth')

    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'user-123' } as never,
      loading: false,
      orgId: null,
      orgSlug: null,
      role: null,
    })

    vi.mocked(getRegistrantProfile).mockResolvedValue({
      uid: 'user-123',
      display_name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '555-1234',
      address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' },
      emergency_contact: { name: 'Bob Smith', phone: '555-9999', relationship: 'Spouse' },
      saved_members: [],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    })

    render(<RegistrationForm camp={mockCamp} org={mockOrg} />)

    await screen.findByDisplayValue('Jane')
    expect(screen.getByDisplayValue('Smith')).toBeInTheDocument()
    expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument()
  })
})
