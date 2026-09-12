import { describe, it, expect, vi, beforeEach } from 'vitest'

// sendRunSheetCore (lib/ops/event-ops.ts) — the render+send the self-send
// action AND the evening-before cron share (inc-3 B5). These are the inline-
// content assertions that lived on the action test before the extraction:
// the core is where the behavior now lives, so the tests moved with it.

const eventDocGet = vi.hoisted(() => vi.fn())
const orgDocGet = vi.hoisted(() => vi.fn())
const planDocGet = vi.hoisted(() => vi.fn())
vi.mock('@/lib/firebase-admin', () => {
  const planDoc = { get: planDocGet }
  const opsColl = { doc: () => planDoc }
  const eventDoc = { get: eventDocGet, collection: () => opsColl }
  const eventsColl = { doc: () => eventDoc }
  const orgDoc = { get: orgDocGet, collection: () => eventsColl }
  return { adminDb: { collection: () => ({ doc: () => orgDoc }) } }
})
vi.mock('@/lib/itinerary-data', () => ({
  listItineraryCore: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/email', () => ({
  sendRunSheetEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/sending-domain', () => ({
  getVerifiedSendingDomainCore: vi.fn().mockResolvedValue('mail.demo.co'),
}))

import { sendRunSheetEmail } from '@/lib/email'
import { getVerifiedSendingDomainCore } from '@/lib/sending-domain'
import { sendRunSheetCore } from '@/lib/ops/event-ops'

const EVENT = {
  name: 'Smith Wedding',
  slug: 'smith-wedding-2026',
  event_start: '2026-08-29',
  event_end: '2026-08-29',
  hours: { start: '15:00', end: '21:00' },
  location: { name: 'Basque Center', address: '601 W Grove St' },
  key_contacts: [{ name: 'Sam', role: 'Coordinator', phone: '208-555-0000' }],
}
const ORG = {
  slug: 'demo',
  name: 'BrewTrax',
  branding: { display_name: 'BrewTrax Events' },
  ops_buffers: { pack_minutes: 50, drive_minutes: 20 },
}
const PLAN = {
  requirements: { guests: 60, site_needs: ['power'] },
  shopping_list: [{ resource_id: 'r1', name: 'Cups', qty: 100, checked: true }],
  packing_list: [{ resource_id: 'r2', name: 'Kegerator', qty: 1, checked: false }],
  checklists: [
    { id: 'c1', name: 'Setup', phase: 'setup', steps: [{ text: 'x', evidence: 'none', done: true }] },
    { id: 'c2', name: 'Prep', phase: 'prep', steps: [{ text: 'y', evidence: 'none', done: false }] },
  ],
  deadlines: [], needs_review: false, change_log: [], package_ids: [], created_at: 't',
}

beforeEach(() => {
  vi.clearAllMocks()
  eventDocGet.mockResolvedValue({ exists: true, data: () => EVENT })
  orgDocGet.mockResolvedValue({ exists: true, data: () => ORG })
  planDocGet.mockResolvedValue({ exists: true, data: () => PLAN })
  vi.mocked(getVerifiedSendingDomainCore).mockResolvedValue('mail.demo.co')
})

describe('sendRunSheetCore', () => {
  it('sends INLINE content to the PASSED recipient — the core is guard-free, identity comes from the caller', async () => {
    const result = await sendRunSheetCore('o1', 'e1', { email: 'owner@demo.co' })
    expect(result).toEqual({ to: 'owner@demo.co' })

    const call = vi.mocked(sendRunSheetEmail).mock.calls[0][0]
    expect(call.to).toBe('owner@demo.co')
    // The content stands alone: anchor, back-plan under ORG buffers, venue,
    // contacts, site needs, load status — never a login-walled link as the body.
    expect(call.anchor).toEqual({ label: 'Starts', display: '3:00 PM' })
    // 3:00 PM − 20m drive = 2:40 PM; − 50m pack = 1:50 PM (org buffers, not constants).
    expect(call.backPlan).toEqual({ packBy: '1:50 PM', leaveBy: '2:40 PM' })
    expect(call.buffers).toEqual({ pack_minutes: 50, drive_minutes: 20 })
    expect(call.venue).toEqual({ name: 'Basque Center', address: '601 W Grove St' })
    expect(call.contacts).toEqual([{ name: 'Sam', role: 'Coordinator', phone: '208-555-0000' }])
    expect(call.siteNeeds).toEqual(['power'])
    expect(call.loadout).toEqual({ checked: 1, total: 2 })
    // Day-of phases only, same filter as the run sheet itself.
    expect(call.checklists).toEqual([{ name: 'Setup', done: 1, total: 1 }])
    expect(call.fromDisplayName).toBe('BrewTrax Events')
    expect(call.fromDomain).toBe('mail.demo.co')
    expect(call.orgSlug).toBe('demo')
    expect(call.eventSlug).toBe('smith-wedding-2026')
  })

  it('threads the per-event buffer override into the back-plan AND the label params (inc-3 S3.1 — the evening email must not disagree with the screen)', async () => {
    planDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...PLAN, requirements: { ...PLAN.requirements, buffers: { drive_minutes: 90 } } }),
    })
    await sendRunSheetCore('o1', 'e1', { email: 'owner@demo.co' })
    const call = vi.mocked(sendRunSheetEmail).mock.calls[0][0]
    // 3:00 PM − 90m EVENT drive = 1:30 PM leave; − 50m ORG pack = 12:40 PM pack.
    expect(call.backPlan).toEqual({ packBy: '12:40 PM', leaveBy: '1:30 PM' })
    expect(call.buffers).toEqual({ pack_minutes: 50, drive_minutes: 20 })
    expect(call.eventBuffers).toEqual({ drive_minutes: 90 })
  })

  it('a failed domain lookup must not block the send — falls back to the default from', async () => {
    vi.mocked(getVerifiedSendingDomainCore).mockRejectedValueOnce(new Error('firestore down'))
    await sendRunSheetCore('o1', 'e1', { email: 'op@demo.co' })
    const call = vi.mocked(sendRunSheetEmail).mock.calls[0][0]
    expect(call.fromDomain).toBeUndefined()
  })

  it('throws when the event does not exist — never a phantom send', async () => {
    eventDocGet.mockResolvedValue({ exists: false })
    await expect(sendRunSheetCore('o1', 'e1', { email: 'op@demo.co' })).rejects.toThrow('Event not found')
    expect(sendRunSheetEmail).not.toHaveBeenCalled()
  })

  it('propagates a rejected send — nothing may report "sent" past a throw', async () => {
    vi.mocked(sendRunSheetEmail).mockRejectedValueOnce(new Error('Email delivery failed'))
    await expect(sendRunSheetCore('o1', 'e1', { email: 'op@demo.co' })).rejects.toThrow('Email delivery failed')
  })
})
