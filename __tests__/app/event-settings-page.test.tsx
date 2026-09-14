import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The settings page is a client component that loads its data in an effect.
// Mock the actions + navigation so none of the firebase-admin graph is pulled in.
const { refreshSpy, updateEventSpy, modulesSpy, getEventBySlugSpy } = vi.hoisted(() => ({
  refreshSpy: vi.fn(),
  updateEventSpy: vi.fn().mockResolvedValue(undefined),
  modulesSpy: vi.fn((): string[] => []),
  getEventBySlugSpy: vi.fn(),
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

// D3 closeout: the page no longer imports actions/event-types at all — that
// module is deleted in a later task. No mock needed (and none allowed to
// mask an accidental re-import: an un-mocked import would pull the real
// firebase-admin graph and fail the test loudly instead).
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
// the registration-type default (ON for child registration) stays live.
// (The legacy "Event type" select this default used to re-derive from live is
// gone as of D3 closeout — see the describe blocks below; the effective
// default now just reads the event's own stored registration_type.)
describe('Event settings — guardian pickup toggle (P3 tri-state)', () => {
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

  it('a child-registration event (no in-page switcher anymore) still defaults the untouched box to ON', async () => {
    getEventBySlugSpy.mockResolvedValue({ ...BASE_EVENT, registration_type: 'child' })
    render(<EventSettingsPage />)
    const box = await screen.findByLabelText(/email the family/i)
    expect(box).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() => expect(updateEventSpy).toHaveBeenCalled())
    const payload = updateEventSpy.mock.calls[0][2] as Record<string, unknown>
    expect('notify_family_on_pickup' in payload).toBe(false)
  })
})

// D3 closeout item 3a/3c: the legacy "Event type" select is gone from this
// page entirely (Settings → Event types owns type assignment now); the
// event's stored event_type_id/registration_type/event_type_terminology must
// pass through every save completely untouched.
describe('Event settings — legacy event-type select removed', () => {
  it('renders no "Event type" control and never sends event_type_id/registration_type/event_type_terminology on save', async () => {
    render(<EventSettingsPage />)
    await screen.findByLabelText(/venue name/i)
    expect(screen.queryByLabelText(/event type/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() => expect(updateEventSpy).toHaveBeenCalled())
    const payload = updateEventSpy.mock.calls[0][2] as Record<string, unknown>
    expect('event_type_id' in payload).toBe(false)
    expect('registration_type' in payload).toBe(false)
    expect('event_type_terminology' in payload).toBe(false)
  })
})

// D3 closeout item 3: registration fields must not write for roster-off
// orgs, even when the event already carries stored values (e.g. from before
// the org's pack was changed, or bad legacy data) — this is the standing
// ROADMAP:406 thread this branch closes.
describe('Event settings — registration fields respect the roster gate', () => {
  it('omits registration_open/close, capacity, and payment_amount when roster is off, even if already stored on the event', async () => {
    modulesSpy.mockReturnValue([])
    getEventBySlugSpy.mockResolvedValue({
      ...BASE_EVENT,
      registration_open: '2026-01-01',
      registration_close: '2026-02-01',
      capacity: 50,
      payment_amount: 25,
    })
    render(<EventSettingsPage />)
    await screen.findByLabelText(/venue name/i)
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() => expect(updateEventSpy).toHaveBeenCalled())
    const payload = updateEventSpy.mock.calls[0][2] as Record<string, unknown>
    expect('registration_open' in payload).toBe(false)
    expect('registration_close' in payload).toBe(false)
    expect('capacity' in payload).toBe(false)
    expect('payment_amount' in payload).toBe(false)
  })

  it('includes registration fields when roster is on', async () => {
    modulesSpy.mockReturnValue(['attendee-roster'])
    getEventBySlugSpy.mockResolvedValue({
      ...BASE_EVENT,
      registration_open: '2026-01-01',
      capacity: 50,
    })
    render(<EventSettingsPage />)
    await screen.findByLabelText(/registration opens/i)
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() => expect(updateEventSpy).toHaveBeenCalled())
    const payload = updateEventSpy.mock.calls[0][2] as Record<string, unknown>
    expect(payload.registration_open).toBe('2026-01-01')
    expect(payload.capacity).toBe(50)
  })
})

// D3 closeout item 3b: the Status option copy claimed "registration open" for
// every org, even ones with no registration feature at all.
describe('Event settings — Status option copy is roster-aware', () => {
  it('shows plain "Active" when roster is off', async () => {
    modulesSpy.mockReturnValue([])
    render(<EventSettingsPage />)
    const status = await screen.findByLabelText(/^status$/i)
    expect(within(status).getByText('Active')).toBeInTheDocument()
    expect(within(status).queryByText(/Active — registration open/i)).toBeNull()
  })

  it('shows "Active — registration open" when roster is on', async () => {
    modulesSpy.mockReturnValue(['attendee-roster'])
    render(<EventSettingsPage />)
    const status = await screen.findByLabelText(/^status$/i)
    expect(within(status).getByText(/Active — registration open/i)).toBeInTheDocument()
  })
})
