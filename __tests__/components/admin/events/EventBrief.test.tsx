import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// EventBrief is a server-renderable leaf, but it imports lib/event-spine for
// the judgment math and that module's read units sit on firebase-admin — mock
// the admin handle so none of the SDK graph initializes under vitest. The
// brief itself never reads: all judgment inputs arrive via props.
vi.mock('@/lib/firebase-admin', () => ({ adminDb: {} }))

import { EventBrief } from '@/components/admin/events/EventBrief'
import type { EventSpineKpis } from '@/lib/event-spine'
import type { Event } from '@/lib/types'

// The live defect's exact shape: a long, DYNAMIC promoted-blocker label. At a
// 375px viewport the kit Button's whitespace-nowrap ran this button to ~495px
// (right edge 514px) — the '— 9d overdue' tail clipped invisible with the tap
// target off-canvas.
const NBA_LABEL = 'Confirm site details (power, water, access) — 9d overdue'

const event: Event = {
  id: 'e1',
  name: 'Vineyard Wedding',
  slug: 'vineyard-wedding',
  year: 2026,
  status: 'active',
  event_type_id: 'general',
  event_start: '2026-08-30',
  event_end: '2026-08-30',
  created_at: '2026-08-01T00:00:00.000Z',
}

const kpis: EventSpineKpis = {
  registrations: null,
  financial: null,
  readiness: null,
  // hasPlan + upcoming phase → the deadline blocker below is PROMOTED to the
  // single primary NBA button (computeEventNba), carrying its actionLabel.
  ops: { hasPlan: true, loadlist: { packed: 0, total: 0 } },
  ar: null,
  closeout: null,
  firstItineraryTime: null,
  blockers: [{ kind: 'deadline', label: NBA_LABEL, actionLabel: NBA_LABEL, severity: 'alert' }],
}

const has = (className: string, token: string) =>
  className.split(/\s+/).includes(token)

describe('EventBrief — NBA button wraps instead of overflowing a phone viewport', () => {
  it('overrides the kit nowrap at the call site: wrap, 44px as a MINIMUM, full label kept', () => {
    render(
      <EventBrief
        orgSlug="acme"
        eventSlug="vineyard-wedding"
        event={event}
        kpis={kpis}
        today="2026-08-24"
        isAdmin={false}
        allowedPages={['ops']}
      />
    )

    const nba = screen.getByText(NBA_LABEL).closest('a')
    expect(nba).not.toBeNull()
    const cls = nba!.className

    // The wrap override survives tailwind-merge: whitespace-normal must WIN
    // over the kit base's whitespace-nowrap (same merge group), and h-auto
    // must replace size=touch's fixed h-11 — with min-h-11 keeping WCAG/HIG
    // 44px as the floor, not the ceiling.
    expect(has(cls, 'whitespace-normal')).toBe(true)
    expect(has(cls, 'whitespace-nowrap')).toBe(false)
    expect(has(cls, 'h-auto')).toBe(true)
    expect(has(cls, 'h-11')).toBe(false)
    expect(has(cls, 'min-h-11')).toBe(true)
    expect(has(cls, 'text-left')).toBe(true)

    // The dynamic overdue tail — the exact text the nowrap clip swallowed —
    // renders inside the link, and the link still targets the blocker's page.
    expect(nba).toHaveTextContent('— 9d overdue')
    expect(nba).toHaveAttribute('href', '/acme/vineyard-wedding/ops')
  })
})
