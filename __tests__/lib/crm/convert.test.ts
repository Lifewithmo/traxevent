import { describe, it, expect, vi, beforeEach } from 'vitest'

const createEventCore = vi.hoisted(() => vi.fn())
const listEventsByLeadCore = vi.hoisted(() => vi.fn())
const leadGet = vi.hoisted(() => vi.fn())

// '@/lib/crm/leads' is partially mocked below via `orig`, which imports the
// real module — and that module imports '@/lib/firebase-admin' at load time,
// which throws without real credentials. Stub it the same way
// __tests__/actions/today.test.ts does for the same orig-mock pattern.
vi.mock('@/lib/firebase-admin', () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }) } }))
vi.mock('@/lib/events', () => ({ createEventCore, listEventsByLeadCore }))
vi.mock('@/lib/crm/leads', async (orig) => ({
  ...(await orig<typeof import('@/lib/crm/leads')>()),
  leadsRef: () => ({ doc: () => ({ get: leadGet }) }),
}))

import { convertOpportunityToWorkCore } from '@/lib/crm/convert'
import { getEventType } from '@/lib/event-types'

const input = {
  name: 'Nguyen Wedding',
  date: '2026-09-12',
  event_type_id: 'coffee-service',
  registration_type: 'individual' as const,
}

const wonLead = { exists: true, data: () => ({ id: 'l1', name: 'Dana Kim', stage: 'closed_won', created_at: 'x' }) }

describe('convertOpportunityToWorkCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leadGet.mockResolvedValue(wonLead)
    listEventsByLeadCore.mockResolvedValue([])
    createEventCore.mockResolvedValue({ id: 'e1', slug: 'nguyen-wedding-2026' })
  })

  it('creates an event carrying the lead id, with the date on both ends', async () => {
    const event = await convertOpportunityToWorkCore('o1', 'l1', { ...input, headcount: 180 })
    expect(createEventCore).toHaveBeenCalledWith('o1', {
      name: 'Nguyen Wedding',
      year: 2026,
      registration_type: 'individual',
      event_type_id: 'coffee-service',
      event_start: '2026-09-12',
      event_end: '2026-09-12',
      headcount: 180,
      key_contacts: [{ name: 'Dana Kim', role: 'Client' }],
      lead_id: 'l1',
    })
    expect(event.id).toBe('e1')
  })

  // The run sheet's tap-to-call chips are only as good as this seed — the
  // conversion is the one moment the CRM contact and the job meet.
  it('seeds a Client key contact carrying the lead phone and email', async () => {
    leadGet.mockResolvedValue({
      exists: true,
      data: () => ({
        id: 'l1', name: 'Dana Kim', stage: 'closed_won', created_at: 'x',
        phone: '208-555-0100', email: 'dana@example.com',
      }),
    })
    await convertOpportunityToWorkCore('o1', 'l1', input)
    expect(createEventCore.mock.calls[0][1].key_contacts).toEqual([
      { name: 'Dana Kim', role: 'Client', phone: '208-555-0100', email: 'dana@example.com' },
    ])
  })

  it('omits phone/email keys the lead does not have (Firestore rejects undefined)', async () => {
    await convertOpportunityToWorkCore('o1', 'l1', input)
    const [contact] = createEventCore.mock.calls[0][1].key_contacts
    expect(contact).toEqual({ name: 'Dana Kim', role: 'Client' })
    expect('phone' in contact).toBe(false)
    expect('email' in contact).toBe(false)
  })

  it('passes booking hours through when provided', async () => {
    await convertOpportunityToWorkCore('o1', 'l1', { ...input, hours: { start: '15:00', end: '19:00' } })
    expect(createEventCore.mock.calls[0][1].hours).toEqual({ start: '15:00', end: '19:00' })
  })

  it('omits hours when absent — the lead has no time field to claim from (B7)', async () => {
    await convertOpportunityToWorkCore('o1', 'l1', input)
    expect('hours' in createEventCore.mock.calls[0][1]).toBe(false)
  })

  it('rejects reversed or zero-length hours before reading the opportunity', async () => {
    await expect(
      convertOpportunityToWorkCore('o1', 'l1', { ...input, hours: { start: '15:00', end: '15:00' } })
    ).rejects.toThrow('End time must be after the start time')
    expect(leadGet).not.toHaveBeenCalled()
  })

  it('rejects malformed hours', async () => {
    await expect(
      convertOpportunityToWorkCore('o1', 'l1', { ...input, hours: { start: '3pm', end: '19:00' } })
    ).rejects.toThrow('Times must be in HH:mm format')
  })

  it('derives the year from the date', async () => {
    await convertOpportunityToWorkCore('o1', 'l1', { ...input, date: '2027-01-04' })
    expect(createEventCore.mock.calls[0][1].year).toBe(2027)
  })

  it('passes custom terminology through when present', async () => {
    const terminology = getEventType('event').terminology
    await convertOpportunityToWorkCore('o1', 'l1', { ...input, event_type_terminology: terminology })
    expect(createEventCore.mock.calls[0][1].event_type_terminology).toBe(terminology)
  })

  it('omits headcount when absent rather than writing undefined', async () => {
    await convertOpportunityToWorkCore('o1', 'l1', input)
    expect('headcount' in createEventCore.mock.calls[0][1]).toBe(false)
  })

  it('refuses a second conversion', async () => {
    listEventsByLeadCore.mockResolvedValue([{ id: 'e-existing' }])
    await expect(convertOpportunityToWorkCore('o1', 'l1', input)).rejects.toThrow('This opportunity is already scheduled')
    expect(createEventCore).not.toHaveBeenCalled()
  })

  it('refuses an opportunity that is not won', async () => {
    leadGet.mockResolvedValue({ exists: true, data: () => ({ id: 'l1', name: 'Dana Kim', stage: 'proposal', created_at: 'x' }) })
    await expect(convertOpportunityToWorkCore('o1', 'l1', input)).rejects.toThrow('Only a won opportunity can be scheduled')
  })

  it('refuses a missing opportunity', async () => {
    leadGet.mockResolvedValue({ exists: false })
    await expect(convertOpportunityToWorkCore('o1', 'l1', input)).rejects.toThrow('Opportunity not found')
  })

  it('requires a name', async () => {
    await expect(convertOpportunityToWorkCore('o1', 'l1', { ...input, name: '  ' })).rejects.toThrow('A job name is required')
  })

  it('requires a date', async () => {
    await expect(convertOpportunityToWorkCore('o1', 'l1', { ...input, date: '' })).rejects.toThrow('A job date is required')
  })

  it('rejects a malformed date before reading the opportunity', async () => {
    await expect(convertOpportunityToWorkCore('o1', 'l1', { ...input, date: '09/12/2026' })).rejects.toThrow(
      'A job date must be in YYYY-MM-DD format'
    )
    expect(leadGet).not.toHaveBeenCalled()
  })

  it('rejects a negative headcount before reading the opportunity', async () => {
    await expect(convertOpportunityToWorkCore('o1', 'l1', { ...input, headcount: -5 })).rejects.toThrow(
      'Headcount must be a positive number'
    )
    expect(leadGet).not.toHaveBeenCalled()
  })

  it('rejects a non-finite headcount', async () => {
    await expect(convertOpportunityToWorkCore('o1', 'l1', { ...input, headcount: NaN })).rejects.toThrow(
      'Headcount must be a positive number'
    )
  })

  it('rejects a zero headcount', async () => {
    await expect(convertOpportunityToWorkCore('o1', 'l1', { ...input, headcount: 0 })).rejects.toThrow(
      'Headcount must be a positive number'
    )
  })

  it('passes kind through to the created event', async () => {
    await convertOpportunityToWorkCore('o1', 'l1', {
      name: 'Market stall', date: '2026-06-06',
      event_type_id: 'coffee-service', kind: 'market_day',
    })
    expect(createEventCore).toHaveBeenCalledWith('o1', expect.objectContaining({ kind: 'market_day' }))
    // registration_type omitted → not forwarded
    const arg = createEventCore.mock.calls[0][1]
    expect(arg).not.toHaveProperty('registration_type')
  })
})
