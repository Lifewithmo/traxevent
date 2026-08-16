'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  createSeriesCore, getSeriesCore, listSeriesCore, listSeriesDaysCore,
  updateSeriesCore, extendSeriesCore, endSeriesCore,
  type CreateSeriesInput, type SeriesUpdate,
} from '@/lib/occasions/series'
import type { Event, EventSeries } from '@/lib/types'

export async function createSeries(orgId: string, input: CreateSeriesInput): Promise<{ series: EventSeries; created: number }> {
  await assertOrgAdmin(orgId)
  return createSeriesCore(orgId, input)
}

export async function getSeries(orgId: string, seriesId: string): Promise<EventSeries | null> {
  await assertOrgMember(orgId)
  return getSeriesCore(orgId, seriesId)
}

export async function listSeries(orgId: string): Promise<EventSeries[]> {
  await assertOrgMember(orgId)
  return listSeriesCore(orgId)
}

export async function listSeriesDays(orgId: string, seriesId: string): Promise<Event[]> {
  await assertOrgMember(orgId)
  return listSeriesDaysCore(orgId, seriesId)
}

export async function updateSeries(orgId: string, seriesId: string, updates: SeriesUpdate, opts?: { propagate?: boolean }): Promise<void> {
  await assertOrgAdmin(orgId)
  return updateSeriesCore(orgId, seriesId, updates, opts)
}

export async function extendSeries(orgId: string, seriesId: string, newUntil: string): Promise<{ created: number }> {
  await assertOrgAdmin(orgId)
  return extendSeriesCore(orgId, seriesId, newUntil)
}

export async function endSeries(orgId: string, seriesId: string): Promise<{ archived: number }> {
  await assertOrgAdmin(orgId)
  return endSeriesCore(orgId, seriesId)
}
