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

const mockCamp = {
  id: 'camp-1',
  name: 'Family Camp 2026',
  slug: 'family-camp-2026',
  year: 2026,
  status: 'active' as const,
  registration_type: 'family' as const,
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
    expect(screen.getByText(/Family Members/i)).toBeInTheDocument()
  })
})
