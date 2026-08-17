import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// The settings page is a client component that loads its data in an effect.
// Mock the actions + navigation so none of the firebase-admin graph is pulled in.
const { refreshSpy, updateEventSpy } = vi.hoisted(() => ({
  refreshSpy: vi.fn(),
  updateEventSpy: vi.fn().mockResolvedValue(undefined),
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
  resolveEnabledModules: () => [],
}))

import EventSettingsPage from '@/app/(admin)/[orgSlug]/[eventSlug]/settings/page'

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
