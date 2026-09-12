import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The settings page is a client component that loads its data in an effect.
// Mock the actions + navigation so none of the firebase-admin graph is pulled in.
const { refreshSpy, updateEventSpy, modulesSpy, getEventBySlugSpy, eventTypesSpy } = vi.hoisted(() => ({
  refreshSpy: vi.fn(),
  updateEventSpy: vi.fn().mockResolvedValue(undefined),
  modulesSpy: vi.fn((): string[] => []),
  getEventBySlugSpy: vi.fn(),
  eventTypesSpy: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', eventSlug: 'smith-wedding-2026' }),
  useRouter: () => ({ refresh: refreshSpy }),
}))

vi.mock('@/actions/orgs', () => ({
  getOrgBySlug: vi.fn().mockResolvedValue({ id: 'org1', industry_pack_id: 'general' }),
}))

vi.mock('@/actions/events', () => ({
  getEventBySlug: (...a: unknown[]) => getEventBySlugSpy(...a),
  updateEvent: (...a: unknown[]) => updateEventSpy(...a),
}))

vi.mock('@/actions/event-types', () => ({
  listOrgEventTypes: (...a: unknown[]) => eventTypesSpy(...a),
}))
vi.mock('@/actions/departments', () => ({
  listDepartments: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/industry-packs', () => ({
  resolveEnabledModules: modulesSpy,
}))

import EventSettingsPage from '@/app/(admin)/[orgSlug]/[eventSlug]/settings/page'

// No `kind` field → kindOf() reads this as a client_job (the default).
const BASE_EVENT = {
  id: 'evt1',
  name: 'Smith Wedding',
  slug: 'smith-wedding-2026',
  year: 2026,
  status: 'active',
  event_type_id: 'event',
  event_start: '2026-09-12',
  event_end: '2026-09-12',
  created_at: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  updateEventSpy.mockClear()
  modulesSpy.mockReturnValue([])
  getEventBySlugSpy.mockReset()
  getEventBySlugSpy.mockResolvedValue(BASE_EVENT)
  eventTypesSpy.mockReset()
  eventTypesSpy.mockResolvedValue([])
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

// P3 tri-state pickup toggle: ONLY a value the user actually set is ever
// persisted — an untouched toggle keeps the field ABSENT from the payload so
// the registration-type default (ON for child registration) stays live,
// including when the same save switches the event's type.
describe('Event settings — guardian pickup toggle (P3 tri-state)', () => {
  const INDIVIDUAL_TYPE = {
    id: 'event',
    name: 'Event',
    description: 'General event',
    registrationUnit: 'individual',
    is_custom: false,
  }
  const CHILD_TYPE = {
    id: 'camp',
    name: 'Camp',
    description: 'Kids camp',
    registrationUnit: 'child',
    is_custom: false,
  }

  beforeEach(() => {
    // The Registration card (which owns the toggle) renders for roster orgs
    // on non-market-day events.
    modulesSpy.mockReturnValue(['attendee-roster'])
  })

  it('an untouched toggle keeps notify_family_on_pickup ABSENT from the save payload', async () => {
    render(<EventSettingsPage />)
    await screen.findByLabelText(/email the family/i)
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() => expect(updateEventSpy).toHaveBeenCalled())
    expect('notify_family_on_pickup' in updateEventSpy.mock.calls[0][2]).toBe(false)
  })

  it('a toggle the user actually set persists as an explicit boolean', async () => {
    render(<EventSettingsPage />)
    fireEvent.click(await screen.findByLabelText(/email the family/i))
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() =>
      expect(updateEventSpy).toHaveBeenCalledWith(
        'org1',
        'evt1',
        expect.objectContaining({ notify_family_on_pickup: true }),
      ),
    )
  })

  it('a stored explicit value renders (beating the type default) and round-trips', async () => {
    getEventBySlugSpy.mockResolvedValue({
      ...BASE_EVENT,
      registration_type: 'child',
      notify_family_on_pickup: false,
    })
    render(<EventSettingsPage />)
    const box = await screen.findByLabelText(/email the family/i)
    expect(box).not.toBeChecked() // explicit false beats child default-ON
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() =>
      expect(updateEventSpy).toHaveBeenCalledWith(
        'org1',
        'evt1',
        expect.objectContaining({ notify_family_on_pickup: false }),
      ),
    )
  })

  it('switching to a child-registration type re-derives the untouched box to default-ON and still OMITS the field', async () => {
    // THE silent-OFF bug this pins: converting an event to child-registration
    // must not also persist the OLD type's default (false) as an explicit
    // override that turns pickup emails off forever.
    eventTypesSpy.mockResolvedValue([INDIVIDUAL_TYPE, CHILD_TYPE])
    getEventBySlugSpy.mockResolvedValue({ ...BASE_EVENT, registration_type: 'individual' })
    render(<EventSettingsPage />)
    const box = await screen.findByLabelText(/email the family/i)
    expect(box).not.toBeChecked()

    fireEvent.change(await screen.findByLabelText(/event type/i), { target: { value: 'camp' } })
    // Display re-derives: the untouched toggle shows the default it will get.
    expect(box).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() => expect(updateEventSpy).toHaveBeenCalled())
    const payload = updateEventSpy.mock.calls[0][2] as Record<string, unknown>
    expect(payload.registration_type).toBe('child')
    expect('notify_family_on_pickup' in payload).toBe(false)
  })
})
