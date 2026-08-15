'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listEvents } from '@/actions/events'
import { selectUpcomingEvents } from '@/lib/sidebar-events'
import type { SidebarEventRow } from '@/lib/sidebar-events'

export async function listSidebarEvents(orgId: string, now?: string): Promise<SidebarEventRow[]> {
  await assertOrgMember(orgId)
  const events = await listEvents(orgId)
  return selectUpcomingEvents(events, now ?? new Date().toISOString().slice(0, 10))
}
