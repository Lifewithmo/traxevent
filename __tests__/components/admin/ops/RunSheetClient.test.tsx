import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

// The run sheet's mutations are server actions on the firebase-admin graph;
// the component only needs their signatures.
vi.mock('@/actions/event-ops', () => ({
  completeChecklistStep: vi.fn(),
  confirmReady: vi.fn(),
  sendRunSheet: vi.fn(),
}))

import { RunSheetClient, confirmStamp, type RunSheetClientProps } from '@/components/admin/ops/RunSheetClient'

const localTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// A confirm stamp from a PREVIOUS day, so the walkthrough's exact scenario is
// reproduced: reload the sheet the morning after the evening-before ritual.
const CONFIRMED_AT = new Date(Date.now() - 3 * 86_400_000)
const ISO = CONFIRMED_AT.toISOString()

const baseProps: RunSheetClientProps = {
  orgId: 'org1',
  eventId: 'e1',
  orgSlug: 'acme',
  eventSlug: 'vineyard-wedding',
  eventName: 'Vineyard Wedding',
  dateLabel: 'Sat Aug 29',
  anchor: null,
  isAdmin: false,
  venue: null,
  contacts: [],
  hasPlan: true,
  siteNeeds: [],
  itinerary: [],
  checklists: [],
  loadout: null,
  // Server-loaded confirmation (a reload, not a fresh tap): the stamp must
  // still come out viewer-local.
  readyConfirmed: { at: ISO, by: 'user-2' },
  confirmedByName: 'BrewTrax Demo',
}

describe('confirmStamp — viewer-local formatter', () => {
  it('formats the ISO instant with the local-timezone clock face', () => {
    // Expected via the same Intl surface but computed independently in the
    // test env's own zone: whatever TZ this run has, the stamp must agree
    // with it — a hardcoded/UTC formatter fails here in any non-UTC zone.
    expect(confirmStamp(ISO)).toContain(localTime(CONFIRMED_AT))
  })

  it('prefixes the weekday when the confirm day is not today', () => {
    const weekday = CONFIRMED_AT.toLocaleDateString('en-US', { weekday: 'short' })
    expect(confirmStamp(ISO)).toBe(`${weekday} ${localTime(CONFIRMED_AT)}`)
  })

  it('drops the weekday for a same-day confirm', () => {
    const now = new Date()
    expect(confirmStamp(now.toISOString())).toBe(localTime(now))
  })

  it('returns empty for an unparseable stamp', () => {
    expect(confirmStamp('not-a-date')).toBe('')
  })
})

describe('RunSheetClient — confirmed stamp is viewer-local after reload', () => {
  it('SSR bakes NO clock face into the stamp — placeholder until hydration', () => {
    const html = renderToString(<RunSheetClient {...baseProps} />)
    // The defect: the server's formatted time ('9:25 PM' UTC in prod) landed
    // in the HTML and suppressHydrationWarning froze it there. The server
    // pass must now emit only the placeholder — in this test the "server"
    // and viewer share a zone, so ANY appearance of the formatted time in
    // the SSR payload means it was formatted server-side again.
    expect(html).toContain('Confirmed ready')
    expect(html).not.toContain(localTime(CONFIRMED_AT))
    expect(html).toContain('by BrewTrax Demo')
  })

  it('hydrates the SSR HTML without a mismatch, then swaps in the viewer-local stamp', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = renderToString(<RunSheetClient {...baseProps} />)

    // No suppressHydrationWarning remains on the stamp, so a server/client
    // divergence would surface right here as a console.error from React.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<RunSheetClient {...baseProps} />, { container, hydrate: true })
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }

    // Post-hydration: the genuine viewer-local clock face (weekday-prefixed,
    // it is not today) with the server-resolved attribution beside it — the
    // walkthrough's unlabeled server-UTC face can no longer survive reload.
    expect(screen.getByText('Confirmed ready').parentElement).toHaveTextContent(
      `· ${confirmStamp(ISO)} · by BrewTrax Demo`
    )
    container.remove()
  })
})
