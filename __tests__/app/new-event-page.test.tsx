import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The new-event page is a client component that loads its data in an effect.
// Mock the actions + navigation so none of the firebase-admin graph is pulled in.
const { pushSpy, createEventSpy } = vi.hoisted(() => ({
  pushSpy: vi.fn(),
  createEventSpy: vi.fn().mockResolvedValue({ slug: 'summer-gala-2026' }),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
  useRouter: () => ({ push: pushSpy }),
}))

vi.mock('@/actions/orgs', () => ({
  getOrgBySlug: vi.fn().mockResolvedValue({ id: 'org1' }),
}))

vi.mock('@/actions/event-types', () => ({
  // id must equal DEFAULT_EVENT_TYPE_ID ('event') so the form's default selection
  // resolves without opening the <select>.
  listOrgEventTypes: vi.fn().mockResolvedValue([
    { id: 'event', name: 'Client job', description: 'A booked job', registrationUnit: 'individual', terminology: {} },
  ]),
}))

vi.mock('@/actions/events', () => ({
  createEvent: (...a: unknown[]) => createEventSpy(...a),
}))

import NewEventPage from '@/app/(admin)/[orgSlug]/new-event/page'

async function fillBaseFields() {
  // wait for the event type to load (Create button enables once types arrive)
  await waitFor(() => expect(screen.getByRole('button', { name: /create event/i })).not.toBeDisabled())
  fireEvent.change(screen.getByLabelText(/event name/i), { target: { value: 'Summer Gala' } })
  fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-08-22' } })
  fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-08-22' } })
}

describe('NewEventPage — optional booking time', () => {
  beforeEach(() => {
    pushSpy.mockClear()
    createEventSpy.mockClear()
  })

  it('renders optional Start/End time inputs', async () => {
    render(<NewEventPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /create event/i })).not.toBeDisabled())
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/end time/i)).toBeInTheDocument()
  })

  it('persists Event.hours when both times are filled', async () => {
    render(<NewEventPage />)
    await fillBaseFields()
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '16:00' } })
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '21:00' } })
    fireEvent.click(screen.getByRole('button', { name: /create event/i }))
    await waitFor(() => expect(createEventSpy).toHaveBeenCalled())
    expect(createEventSpy.mock.calls[0][1]).toMatchObject({ hours: { start: '16:00', end: '21:00' } })
  })

  it('omits hours when the times are left blank', async () => {
    render(<NewEventPage />)
    await fillBaseFields()
    fireEvent.click(screen.getByRole('button', { name: /create event/i }))
    await waitFor(() => expect(createEventSpy).toHaveBeenCalled())
    expect(createEventSpy.mock.calls[0][1].hours).toBeUndefined()
  })
})
