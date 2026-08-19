import { describe, it, expect } from 'vitest'
import {
  resolveAnchorTime,
  backPlanFromAnchor,
  PACK_MINUTES,
  DRIVE_MINUTES,
} from '@/app/(admin)/[orgSlug]/[eventSlug]/ops/runsheet/anchor'
import type { ItineraryDay } from '@/lib/itinerary'

const itinerary: ItineraryDay[] = [
  {
    day: '2026-08-29',
    items: [
      { id: 'i1', day: '2026-08-29', start_time: '13:30', title: 'Arrive', sort_order: 0, created_at: 'x' },
      { id: 'i2', day: '2026-08-29', start_time: '15:00', title: 'Service', sort_order: 1, created_at: 'x' },
    ],
  },
]

// B7 — the anchor names its source and never fabricates a time.
describe('resolveAnchorTime', () => {
  it('prefers the ops-plan service start, labeled Service', () => {
    const a = resolveAnchorTime({ serviceStart: '2026-08-29T15:00', hoursStart: '14:00', itinerary })
    expect(a).toEqual({ label: 'Service', hhmm: '15:00', display: '3:00 PM' })
  })

  it('falls back to booked hours, labeled Starts', () => {
    const a = resolveAnchorTime({ hoursStart: '14:00', itinerary })
    expect(a).toEqual({ label: 'Starts', hhmm: '14:00', display: '2:00 PM' })
  })

  it('falls back to the earliest itinerary item, labeled First item', () => {
    const a = resolveAnchorTime({ itinerary })
    expect(a).toEqual({ label: 'First item', hhmm: '13:30', display: '1:30 PM' })
  })

  it('returns null when no source has a time — Time TBD, never a made-up one', () => {
    expect(resolveAnchorTime({ itinerary: [] })).toBeNull()
  })

  it('skips a malformed service start instead of rendering garbage', () => {
    const a = resolveAnchorTime({ serviceStart: 'soon', hoursStart: '14:00', itinerary })
    expect(a?.label).toBe('Starts')
  })
})

describe('backPlanFromAnchor', () => {
  it('back-plans pack/leave from the anchor minus the fixed buffers', () => {
    // 3:00 PM − 30m drive = 2:30 PM leave; − 45m pack = 1:45 PM pack.
    expect(backPlanFromAnchor('15:00')).toEqual({ packBy: '1:45 PM', leaveBy: '2:30 PM' })
  })

  it('returns null when the buffers would cross midnight into the previous day', () => {
    expect(backPlanFromAnchor('00:30')).toBeNull()
  })

  it('allows the exact boundary at pack+drive minutes past midnight', () => {
    const total = PACK_MINUTES + DRIVE_MINUTES // 75 → 01:15
    expect(total).toBe(75)
    expect(backPlanFromAnchor('01:15')).toEqual({ packBy: '12:00 AM', leaveBy: '12:45 AM' })
  })

  it('rejects malformed input', () => {
    expect(backPlanFromAnchor('3pm')).toBeNull()
  })
})
