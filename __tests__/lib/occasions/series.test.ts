import { describe, it, expect, vi, beforeEach } from 'vitest'

const seriesSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const seriesGetSpy = vi.hoisted(() => vi.fn())
const seriesUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const seriesListGetSpy = vi.hoisted(() => vi.fn())
const daysQueryGetSpy = vi.hoisted(() => vi.fn())
const eventUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const createEventCoreSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const seriesCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-series-id',
      set: seriesSetSpy,
      get: seriesGetSpy,
      update: seriesUpdateSpy,
    })),
    orderBy: vi.fn().mockReturnValue({ get: seriesListGetSpy }),
  }
  const eventsCol = {
    where: vi.fn().mockReturnValue({ get: daysQueryGetSpy }),
    doc: vi.fn().mockImplementation((id: string) => ({ id, update: eventUpdateSpy })),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) =>
      sub === 'event_series' ? seriesCol : sub === 'events' ? eventsCol : {}),
  }
  return { adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) } }
})

// series.ts builds its own events collection ref from adminDb (it does NOT
// import eventsRef), so the firebase mock above covers day queries/updates —
// only createEventCore needs stubbing here.
vi.mock('@/lib/events', () => ({ createEventCore: createEventCoreSpy }))

import { createSeriesCore, extendSeriesCore, endSeriesCore, updateSeriesCore } from '@/lib/occasions/series'

const INPUT = {
  name: 'Boise Farmers Market',
  location: { name: 'Capitol Blvd' },
  hours: { start: '08:00', end: '13:00' },
  recurrence: { freq: 'weekly' as const, weekday: 6, from: '2026-05-02', until: '2026-05-16' },
  booth_fee: 45,
}

describe('createSeriesCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    daysQueryGetSpy.mockResolvedValue({ docs: [] })
    createEventCoreSpy.mockImplementation(async (_org: string, i: { event_start: string }) =>
      ({ id: `ev-${i.event_start}`, event_start: i.event_start }))
  })

  it('writes the series then one active market-day event per occurrence', async () => {
    const { series, created } = await createSeriesCore('org-1', INPUT)
    expect(created).toBe(3) // 05-02, 05-09, 05-16
    expect(seriesSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Boise Farmers Market', kind: 'market_day', active: true,
    }))
    expect(createEventCoreSpy).toHaveBeenCalledTimes(3)
    expect(createEventCoreSpy).toHaveBeenCalledWith('org-1', expect.objectContaining({
      kind: 'market_day', status: 'active', name: 'Boise Farmers Market',
      event_start: '2026-05-02', event_end: '2026-05-02',
      location: { name: 'Capitol Blvd' }, hours: { start: '08:00', end: '13:00' },
      booth_fee: 45, series_id: series.id,
    }))
  })

  it('is idempotent per (series, day): existing days are skipped', async () => {
    daysQueryGetSpy.mockResolvedValue({ docs: [{ data: () => ({ event_start: '2026-05-09', status: 'active' }) }] })
    const { created } = await createSeriesCore('org-1', INPUT)
    expect(created).toBe(2)
    const starts = createEventCoreSpy.mock.calls.map((c) => c[1].event_start)
    expect(starts).toEqual(['2026-05-02', '2026-05-16'])
  })

  it('rejects an empty season and bad hours', async () => {
    await expect(createSeriesCore('org-1', {
      ...INPUT, recurrence: { ...INPUT.recurrence, from: '2026-05-03', until: '2026-05-08' },
    })).rejects.toThrow('no days')
    await expect(createSeriesCore('org-1', {
      ...INPUT, hours: { start: '13:00', end: '08:00' },
    })).rejects.toThrow('hours')
  })
})

describe('extendSeriesCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createEventCoreSpy.mockImplementation(async (_o: string, i: { event_start: string }) => ({ id: 'x', event_start: i.event_start }))
    seriesGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 's1', ...INPUT, kind: 'market_day', active: true, created_at: 'x',
    }) })
    daysQueryGetSpy.mockResolvedValue({ docs: [
      { data: () => ({ event_start: '2026-05-02' }) },
      { data: () => ({ event_start: '2026-05-09' }) },
      { data: () => ({ event_start: '2026-05-16' }) },
    ] })
  })

  it('generates only the delta and bumps until', async () => {
    const { created } = await extendSeriesCore('org-1', 's1', '2026-05-30')
    expect(created).toBe(2) // 05-23, 05-30
    expect(seriesUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
      recurrence: expect.objectContaining({ until: '2026-05-30' }),
    }))
  })

  it('rejects a shrink', async () => {
    await expect(extendSeriesCore('org-1', 's1', '2026-05-09')).rejects.toThrow('later')
    expect(createEventCoreSpy).not.toHaveBeenCalled()
  })
})

describe('endSeriesCore / updateSeriesCore propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seriesGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 's1', ...INPUT, kind: 'market_day', active: true, created_at: 'x',
    }) })
    daysQueryGetSpy.mockResolvedValue({ docs: [
      { data: () => ({ id: 'd1', event_start: '2026-05-02', status: 'active' }) },   // past
      { data: () => ({ id: 'd2', event_start: '2026-05-09', status: 'archived' }) }, // skipped week
      { data: () => ({ id: 'd3', event_start: '2026-05-16', status: 'active' }) },   // future
    ] })
  })

  it('endSeriesCore deactivates and archives only future non-archived days', async () => {
    const { archived } = await endSeriesCore('org-1', 's1', { today: '2026-05-05' })
    expect(archived).toBe(1)
    expect(seriesUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ active: false }))
    expect(eventUpdateSpy).toHaveBeenCalledTimes(1)
    expect(eventUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }))
  })

  it('updateSeriesCore with propagate updates only future non-archived days', async () => {
    await updateSeriesCore('org-1', 's1', { booth_fee: 55, hours: { start: '09:00', end: '14:00' } },
      { propagate: true, today: '2026-05-05' })
    expect(eventUpdateSpy).toHaveBeenCalledTimes(1)
    expect(eventUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
      booth_fee: 55, hours: { start: '09:00', end: '14:00' },
    }))
  })

  it('updateSeriesCore without propagate touches no days', async () => {
    await updateSeriesCore('org-1', 's1', { booth_fee: 55 })
    expect(eventUpdateSpy).not.toHaveBeenCalled()
    expect(seriesUpdateSpy).toHaveBeenCalled()
  })
})
