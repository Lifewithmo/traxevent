import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The settings page is a client component that loads its data in an effect.
// Mock the actions + navigation so none of the firebase-admin graph is pulled in.
const { refreshSpy, updateEventSpy, modulesSpy } = vi.hoisted(() => ({
  refreshSpy: vi.fn(),
  updateEventSpy: vi.fn().mockResolvedValue(undefined),
  modulesSpy: vi.fn((): string[] => []),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', eventSlug: 'smith-wedding-2026' }),
  useRouter: () => ({ refresh: refreshSpy }),
}))

vi.mock('@/actions/orgs', () => ({
  getOrgBySlug: vi.fn().mockResolvedValue({ id: 'org1', industry_pack_id: 'general' }),
}))

vi.mock('@/actions/events', () => ({
  // No `kind` field → kindOf() reads this as a client_job (the default).
  getEventBySlug: vi.fn().mockResolvedValue({
    id: 'evt1',
    name: 'Smith Wedding',
    slug: 'smith-wedding-2026',
    year: 2026,
    status: 'active',
    event_type_id: 'event',
    event_start: '2026-09-12',
    event_end: '2026-09-12',
    created_at: '2026-01-01T00:00:00.000Z',
  }),
  updateEvent: (...a: unknown[]) => updateEventSpy(...a),
}))

vi.mock('@/actions/event-types', () => ({
  listOrgEventTypes: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/actions/departments', () => ({
  listDepartments: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/industry-packs', () => ({
  resolveEnabledModules: modulesSpy,
}))

import EventSettingsPage from '@/app/(admin)/[orgSlug]/[eventSlug]/settings/page'

beforeEach(() => {
  updateEventSpy.mockClear()
  modulesSpy.mockReturnValue([])
})

describe('Event settings — client-job booking time', () => {
  it('renders start/end time inputs for a client-job event (not only market days)', async () => {
    render(<EventSettingsPage />)
    expect(await screen.findByLabelText(/start time/i)).toBeInTheDocument()
    expect(await screen.findByLabelText(/end time/i)).toBeInTheDocument()
  })

  it('persists the entered hours on save', async () => {
    render(<EventSettingsPage />)
    fireEvent.change(await screen.findByLabelText(/start time/i), { target: { value: '16:00' } })
    fireEvent.change(await screen.findByLabelText(/end time/i), { target: { value: '21:00' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() =>
      expect(updateEventSpy).toHaveBeenCalledWith(
        'org1',
        'evt1',
        expect.objectContaining({ hours: { start: '16:00', end: '21:00' } }),
      ),
    )
  })

  it('rejects a one-sided or reversed time range with an inline error, without saving', async () => {
    updateEventSpy.mockClear() // shared hoisted spy — ignore prior tests' calls
    render(<EventSettingsPage />)
    // one-sided: start only
    fireEvent.change(await screen.findByLabelText(/start time/i), { target: { value: '16:00' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    expect(await screen.findByText(/both a start and end time/i)).toBeInTheDocument()
    expect(updateEventSpy).not.toHaveBeenCalled()

    // reversed: end at/before start
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '15:00' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    expect(await screen.findByText(/end time must be after/i)).toBeInTheDocument()
    expect(updateEventSpy).not.toHaveBeenCalled()
  })
})

describe('Event settings — client-job venue', () => {
  it('renders venue fields for a client job and persists the location', async () => {
    render(<EventSettingsPage />)
    fireEvent.change(await screen.findByLabelText(/venue name/i), { target: { value: 'Basque Center' } })
    fireEvent.change(screen.getByLabelText(/venue address/i), { target: { value: '601 W Grove St, Boise' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() =>
      expect(updateEventSpy).toHaveBeenCalledWith(
        'org1',
        'evt1',
        expect.objectContaining({ location: { name: 'Basque Center', address: '601 W Grove St, Boise' } }),
      ),
    )
  })

  it('clears the location when the name is blanked', async () => {
    render(<EventSettingsPage />)
    await screen.findByLabelText(/venue name/i)
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() =>
      expect(updateEventSpy).toHaveBeenCalledWith('org1', 'evt1', expect.objectContaining({ location: null })),
    )
  })

  it('refuses an address without a venue name instead of silently dropping it', async () => {
    render(<EventSettingsPage />)
    fireEvent.change(await screen.findByLabelText(/venue address/i), { target: { value: '601 W Grove St' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    expect(await screen.findByText(/add a venue name/i)).toBeInTheDocument()
    expect(updateEventSpy).not.toHaveBeenCalled()
  })
})

// B8: contacts split OUT of the roster gate — a roster org's client job still
// has people worth calling on the day.
describe('Event settings — key contacts for roster orgs', () => {
  it('renders the contacts editor without the headcount field, and saves contacts', async () => {
    modulesSpy.mockReturnValue(['attendee-roster'])
    render(<EventSettingsPage />)
    expect(await screen.findByRole('button', { name: /add contact/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/expected headcount/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /add contact/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Site Manager' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() =>
      expect(updateEventSpy).toHaveBeenCalledWith(
        'org1',
        'evt1',
        expect.objectContaining({ key_contacts: [{ name: 'Site Manager', role: '' }] }),
      ),
    )
    // headcount stays out of a roster org's payload — the roster is the count.
    expect('headcount' in updateEventSpy.mock.calls[0][2]).toBe(false)
  })
})
