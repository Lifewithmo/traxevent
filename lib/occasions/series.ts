import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { createEventCore } from '@/lib/events'
import { seriesOccurrences } from '@/lib/occasions/series-logic'
import type { Event, EventHours, EventLocation, EventSeries, SeriesRecurrence } from '@/lib/types'

export interface CreateSeriesInput {
  name: string
  location: EventLocation
  hours: EventHours
  recurrence: SeriesRecurrence
  booth_fee?: number
  event_type_id?: string
}

export interface SeriesUpdate {
  name?: string
  location?: EventLocation
  hours?: EventHours
  booth_fee?: number | null
}

export function seriesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('event_series')
}

function eventsCol(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events')
}

const TIME_RE = /^\d{2}:\d{2}$/

function validateHours(hours: EventHours): void {
  if (!TIME_RE.test(hours.start) || !TIME_RE.test(hours.end) || hours.start >= hours.end) {
    throw new Error('Please enter valid hours (start before end)')
  }
}

/** Days already generated for a series, ascending. */
export async function listSeriesDaysCore(orgId: string, seriesId: string): Promise<Event[]> {
  const snap = await eventsCol(orgId).where('series_id', '==', seriesId).get()
  return snap.docs.map((d) => d.data() as Event).sort((a, b) => a.event_start.localeCompare(b.event_start))
}

// Generation shared by create + extend. Idempotent per (series, day): a day
// with an existing event (any status — archived means deliberately skipped)
// is never re-created (spec §3.2).
async function generateDays(orgId: string, series: EventSeries, days: string[]): Promise<number> {
  const existing = new Set((await listSeriesDaysCore(orgId, series.id)).map((e) => e.event_start))
  let created = 0
  for (const day of days) {
    if (existing.has(day)) continue
    await createEventCore(orgId, {
      name: series.name,
      year: Number(day.slice(0, 4)),
      kind: 'market_day',
      status: 'active',
      event_start: day,
      event_end: day,
      location: series.location,
      hours: series.hours,
      ...(series.booth_fee !== undefined ? { booth_fee: series.booth_fee } : {}),
      ...(series.event_type_id ? { event_type_id: series.event_type_id } : {}),
      series_id: series.id,
    })
    created++
  }
  return created
}

/** Guard-free create: series doc + every day in the season, up-front (spec §3.2). */
export async function createSeriesCore(
  orgId: string,
  input: CreateSeriesInput,
): Promise<{ series: EventSeries; created: number }> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!input.location?.name?.trim()) throw new Error('Location is required')
  validateHours(input.hours)
  if (input.booth_fee !== undefined && !(input.booth_fee >= 0)) throw new Error('Invalid booth fee')
  const days = seriesOccurrences(input.recurrence)
  if (days.length === 0) throw new Error('This schedule produces no days — check the weekday and dates')

  const id = randomBytes(8).toString('hex')
  const series: EventSeries = {
    id,
    name: input.name.trim(),
    kind: 'market_day',
    location: { name: input.location.name.trim(), ...(input.location.address?.trim() ? { address: input.location.address.trim() } : {}) },
    hours: input.hours,
    recurrence: input.recurrence,
    ...(input.booth_fee !== undefined ? { booth_fee: input.booth_fee } : {}),
    ...(input.event_type_id ? { event_type_id: input.event_type_id } : {}),
    active: true,
    created_at: new Date().toISOString(),
  }
  await seriesRef(orgId).doc(id).set(series)
  const created = await generateDays(orgId, series, days)
  return { series, created }
}

export async function getSeriesCore(orgId: string, seriesId: string): Promise<EventSeries | null> {
  const snap = await seriesRef(orgId).doc(seriesId).get()
  return snap.exists ? (snap.data() as EventSeries) : null
}

export async function listSeriesCore(orgId: string): Promise<EventSeries[]> {
  const snap = await seriesRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as EventSeries)
}

/**
 * Update series fields; with opts.propagate, bulk-apply location/hours/
 * booth_fee/name to FUTURE (event_start >= today), NON-ARCHIVED days of this
 * series. Archived (skipped) days stay skipped (spec §3.2). Individually
 * edited day fields are overwritten by propagation — documented behavior.
 */
export async function updateSeriesCore(
  orgId: string,
  seriesId: string,
  updates: SeriesUpdate,
  opts?: { propagate?: boolean; today?: string },
): Promise<void> {
  const series = await getSeriesCore(orgId, seriesId)
  if (!series) throw new Error('Series not found')
  if (updates.hours) validateHours(updates.hours)
  if (updates.name !== undefined && !updates.name.trim()) throw new Error('Name is required')

  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v
  }
  await seriesRef(orgId).doc(seriesId).update({ ...cleaned, updated_at: new Date().toISOString() })

  if (opts?.propagate) {
    const today = opts.today ?? new Date().toISOString().slice(0, 10)
    const days = (await listSeriesDaysCore(orgId, seriesId))
      .filter((d) => d.event_start >= today && d.status !== 'archived')
    const dayPatch: Record<string, unknown> = {}
    if (updates.name !== undefined) dayPatch.name = updates.name.trim()
    if (updates.location !== undefined) dayPatch.location = updates.location
    if (updates.hours !== undefined) dayPatch.hours = updates.hours
    if (updates.booth_fee !== undefined && updates.booth_fee !== null) dayPatch.booth_fee = updates.booth_fee
    for (const day of days) {
      await eventsCol(orgId).doc(day.id).update({ ...dayPatch, updated_at: new Date().toISOString() })
    }
  }
}

/** Raise `until` and generate the delta (idempotent). */
export async function extendSeriesCore(orgId: string, seriesId: string, newUntil: string): Promise<{ created: number }> {
  const series = await getSeriesCore(orgId, seriesId)
  if (!series) throw new Error('Series not found')
  if (newUntil <= series.recurrence.until) throw new Error('The new end date must be later than the current one')
  const recurrence: SeriesRecurrence = { ...series.recurrence, until: newUntil }
  const days = seriesOccurrences(recurrence)
  const created = await generateDays(orgId, { ...series, recurrence }, days)
  await seriesRef(orgId).doc(seriesId).update({ recurrence, updated_at: new Date().toISOString() })
  return { created }
}

/** End the season: deactivate + archive future non-archived days. */
export async function endSeriesCore(orgId: string, seriesId: string, opts?: { today?: string }): Promise<{ archived: number }> {
  const series = await getSeriesCore(orgId, seriesId)
  if (!series) throw new Error('Series not found')
  const today = opts?.today ?? new Date().toISOString().slice(0, 10)
  const future = (await listSeriesDaysCore(orgId, seriesId))
    .filter((d) => d.event_start >= today && d.status !== 'archived')
  for (const day of future) {
    await eventsCol(orgId).doc(day.id).update({ status: 'archived', updated_at: new Date().toISOString() })
  }
  await seriesRef(orgId).doc(seriesId).update({ active: false, updated_at: new Date().toISOString() })
  return { archived: future.length }
}
