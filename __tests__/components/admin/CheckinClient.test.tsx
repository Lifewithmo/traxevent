import { fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

// The check-in mutations are server actions on the firebase-admin graph; the
// component only needs their signatures.
vi.mock('@/actions/checkins', () => ({
  checkInMember: vi.fn(),
  checkInFamily: vi.fn(),
  checkOutMember: vi.fn(),
  checkOutFamily: vi.fn(),
  undoCheckinChanges: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { CheckinClient, fmtTime } from '@/components/admin/CheckinClient'
import type { CheckinRosterMember, CustodyCheckinRecord } from '@/actions/checkins'

const localTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// The walkthrough's exact production scenario: one child currently checked in
// at a server-UTC morning instant, one full in→out cycle with a guardian.
const IN_AT = '2026-08-24T14:38:00.000Z' // screen showed 'In 8:38 AM', SSR baked '2:38 PM'
const OUT_IN_AT = '2026-08-24T14:40:00.000Z'
const OUT_AT = '2026-08-24T19:41:00.000Z' // screen showed 'Out 1:41 PM', SSR baked '7:41 PM'

function member(over: Partial<CheckinRosterMember>): CheckinRosterMember {
  return {
    member_id: 'm1',
    family_id: 'f1',
    first_name: 'Avery',
    last_name: 'Shah',
    family_name: 'Shah',
    allergy_text: '',
    family_balance_due: 0,
    registering_parent: 'Priya Shah',
    emergency_contact_name: 'Dev Shah',
    emergency_contact_phone: '555-0101',
    missing_form_names: [],
    ...over,
  }
}

const members: CheckinRosterMember[] = [
  member({ member_id: 'm1', first_name: 'Avery' }),
  member({ member_id: 'm2', first_name: 'Rohan' }),
]

const checkins: CustodyCheckinRecord[] = [
  {
    id: '2026-08-24_m1',
    date: '2026-08-24',
    member_id: 'm1',
    family_id: 'f1',
    member_name: 'Avery Shah',
    status: 'in',
    checked_in_at: IN_AT,
    history: [{ id: 'h1', action: 'check_in', at: IN_AT }],
  },
  {
    id: '2026-08-24_m2',
    date: '2026-08-24',
    member_id: 'm2',
    family_id: 'f1',
    member_name: 'Rohan Shah',
    status: 'out',
    checked_in_at: OUT_IN_AT,
    checked_out_at: OUT_AT,
    guardian_pickup_name: 'Priya Shah',
    history: [
      { id: 'h2', action: 'check_in', at: OUT_IN_AT },
      { id: 'h3', action: 'check_out', at: OUT_AT, guardian: 'Priya Shah' },
    ],
  },
]

const baseProps = {
  orgId: 'org1',
  eventId: 'e1',
  orgSlug: 'acme',
  eventSlug: 'summer-camp',
  date: '2026-08-24',
  members,
  checkins,
  guardianMode: true,
  memberLabel: 'Children',
}

describe('fmtTime — viewer-local formatter', () => {
  it('formats the ISO instant with the local-timezone clock face', () => {
    // Computed independently through the same Intl surface in the test env's
    // own zone: whatever TZ this run has, the chip must agree with it.
    expect(fmtTime(IN_AT)).toBe(localTime(IN_AT))
  })

  it('returns empty for a missing stamp', () => {
    expect(fmtTime(undefined)).toBe('')
  })
})

describe('CheckinClient — in/out chips are viewer-local without a hydration crash', () => {
  it('SSR bakes NO clock face into the chips — placeholder until hydration', () => {
    const html = renderToString(<CheckinClient {...baseProps} />)
    // The defect: the server's formatted times ('2:38 PM'/'7:41 PM' UTC in
    // prod) landed in the HTML, the browser's hydration pass formatted the
    // viewer's own zone instead, and React aborted with minified error #418 —
    // every button on the page dead. The server pass must now emit only the
    // placeholder — in this test the "server" and viewer share a zone, so ANY
    // appearance of a formatted time in the SSR payload means it was
    // formatted server-side again.
    const text = html.replace(/<!-- -->/g, '') // strip JSX child separators
    expect(text).toContain('In …')
    expect(text).toContain('Out …')
    expect(html).not.toContain(localTime(IN_AT))
    expect(html).not.toContain(localTime(OUT_AT))
    // Zone-independent row content still SSRs: names, guardian, counts.
    expect(text).toContain('Priya Shah')
    expect(text).toContain('1 in')
  })

  it('hydrates the SSR HTML with zero console.error, then swaps in the viewer-local times', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = renderToString(<CheckinClient {...baseProps} />)

    // No suppressHydrationWarning anywhere on the chips, so a server/client
    // divergence would surface right here as a console.error from React.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<CheckinClient {...baseProps} />, { container, hydrate: true })
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }

    // Post-hydration: the genuine viewer-local clock faces — the walkthrough's
    // UTC faces can no longer survive into the operator's chips.
    expect(screen.getByText(`In ${localTime(IN_AT)}`)).toBeInTheDocument()
    expect(
      screen.getByText(`Out ${localTime(OUT_AT)} · Priya Shah`)
    ).toBeInTheDocument()

    // And the handlers are ALIVE — the production symptom was an inert page
    // (hydration aborted, nothing attached). Typing in the sticky search must
    // actually filter.
    fireEvent.change(screen.getByLabelText('Search the roster'), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText(/No name matching/)).toBeInTheDocument()

    container.remove()
  })
})
