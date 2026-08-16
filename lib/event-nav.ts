// The event nav model — one builder consumed by BOTH the sidebar's Events
// section and the event spine's tab row, so the two can never disagree about
// which pages a member sees. Pure data: no React, no Firestore.
import type { Terminology } from '@/lib/event-types'
import type { EventKind, EventPage } from '@/lib/types'
import type { ModuleId } from '@/lib/industry-packs'

/** `key` doubles as the route segment: /{orgSlug}/{eventSlug}/{key}. */
export interface EventNavItem {
  key: string
  label: string
}

// Per-event nav items that belong to the optional attendee-roster module.
const ROSTER_KEYS = new Set(['families', 'assignments', 'checkin'])

// Market days get an explicit, minimal nav — none of the client-job pages
// (Ops, roster, etc.) apply. Register + Closeout join this list with the
// counter-register increment.
const MARKET_DAY_NAV: EventNavItem[] = [
  { key: 'dashboard', label: 'Overview' },
  { key: 'settings', label: 'Settings' },
]

export interface BuildEventNavInput {
  kind?: EventKind
  terminology: Terminology
  allowedPages?: EventPage[]
  enabledModules?: ModuleId[]
}

/**
 * Build the visible per-event nav. Rules preserved from the sidebar's
 * original inline model: market_day → Overview + Settings only;
 * dashboard + settings always visible regardless of page grants;
 * roster pages (families/assignments/checkin) gated on the
 * 'attendee-roster' module; labels driven by terminology.
 * Teams and Budget are deliberately absent — no routes exist for them.
 */
export function buildEventNav({ kind, terminology, allowedPages, enabledModules }: BuildEventNavInput): EventNavItem[] {
  if (kind === 'market_day') return MARKET_DAY_NAV

  const has = (m: ModuleId) => !enabledModules || enabledModules.includes(m)

  const items: EventNavItem[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'ops', label: 'Event Ops' },
    { key: 'families', label: terminology.registrantPlural },
    { key: 'assignments', label: terminology.assignmentPlural },
    { key: 'itinerary', label: 'Itinerary' },
    { key: 'communicate', label: 'Communicate' },
    { key: 'forms', label: 'Forms' },
    { key: 'people', label: 'People' },
    { key: 'checkin', label: 'Check-in' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ]

  return items
    .filter(
      (n) =>
        !allowedPages ||
        n.key === 'dashboard' ||
        n.key === 'settings' ||
        allowedPages.includes(n.key as EventPage)
    )
    .filter((n) => !ROSTER_KEYS.has(n.key) || has('attendee-roster'))
}
