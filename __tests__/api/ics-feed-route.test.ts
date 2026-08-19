import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CalendarItem } from '@/lib/calendar'

// The org lookup is the only Firestore touch in the handler: orgs.where('slug').limit(1).get()
const { orgGetSpy, assembleSpy } = vi.hoisted(() => ({
  orgGetSpy: vi.fn(),
  assembleSpy: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({ get: orgGetSpy }),
      }),
    }),
  },
}))
vi.mock('@/lib/calendar-feed', () => ({ assembleCalendarFeed: assembleSpy }))

import { GET } from '@/app/ics/[orgSlug]/[token]/route'

const TOKEN = 'tok123'
const ORG_DOC = { id: 'org-1', data: () => ({ ics_token: TOKEN, name: 'BrewTrax' }) }

// One item per kind, so a response can be inspected for exactly what leaked.
const FEED: CalendarItem[] = [
  { id: 'e1', title: 'Alder wedding', date: '2026-08-22', kind: 'event', href: '/acme/alder/dashboard' },
  { id: 'l1', title: 'Hold: Ortiz', date: '2026-08-24', kind: 'lead', href: '/acme/leads/l1' },
  { id: 't1', title: 'Confirm headcount', date: '2026-08-20', kind: 'task', href: '/acme/leads/l1' },
  { id: 'f1', title: 'Follow up: Ortiz', date: '2026-08-21', kind: 'follow_up', href: '/acme/leads/l1' },
  { id: 'c1', title: 'Health permit expires', date: '2026-08-30', kind: 'compliance', href: '/acme/compliance' },
  { id: 'i1', title: 'Final invoice', date: '2026-08-25', kind: 'invoice_due', href: '/acme/leads/l1', amount: 4820 },
  { id: 'd1:w1', title: 'Drop pickup: Weekend', date: '2026-08-23', kind: 'drop', href: '/acme/drop-orders/d1' },
]

function req(query = '') {
  return new Request(`https://app.example/ics/acme/${TOKEN}${query}`)
}
const params = Promise.resolve({ orgSlug: 'acme', token: TOKEN })
const call = (query = '') => GET(req(query), { params })

/** The money line: invoice_due inlines the outstanding balance into SUMMARY. */
const MONEY = /SUMMARY:Final invoice/

beforeEach(() => {
  vi.clearAllMocks()
  orgGetSpy.mockResolvedValue({ empty: false, docs: [ORG_DOC] })
  assembleSpy.mockResolvedValue(FEED)
})

describe('GET /ics/[orgSlug]/[token] — include filter', () => {
  it('ABSENT param serves every kind (the documented default for a bare subscribe URL)', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.text()
    for (const uid of ['event-e1', 'lead-l1', 'task-t1', 'follow_up-f1', 'compliance-c1', 'invoice_due-i1', 'drop-d1:w1']) {
      expect(body).toContain(`UID:${uid}@traxevent`)
    }
  })

  it('ALL-CHECKED (every kind named) serves every kind', async () => {
    const res = await call('?include=event,lead,task,follow_up,compliance,invoice_due,drop')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('UID:event-e1@traxevent')
    expect(body).toMatch(MONEY)
  })

  it('SOME-CHECKED serves only the named kinds — money stays off a shared calendar', async () => {
    const res = await call('?include=event,lead,task,follow_up,compliance,drop')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('UID:event-e1@traxevent')
    expect(body).toContain('UID:drop-d1:w1@traxevent')
    // the whole point of the filter
    expect(body).not.toContain('UID:invoice_due-i1@traxevent')
    expect(body).not.toMatch(MONEY)
    expect(body).not.toContain('4,820')
  })

  // THE DEFECT. `?include=` is exactly what the panel used to build with zero
  // boxes checked; `searchParams.get()` returns '' for it, '' is falsy, and the
  // old truthiness check therefore fell through to CALENDAR_KINDS and served the
  // ENTIRE feed — invoice balances included — to a link the operator believed
  // carried nothing.
  it('NONE-CHECKED (?include=) fails CLOSED — 404, and no invoice data at all', async () => {
    const res = await call('?include=')
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).not.toMatch(MONEY)
    expect(body).not.toContain('BEGIN:VCALENDAR')
    expect(body).not.toContain('UID:')
    // the feed is never even assembled — nothing to leak
    expect(assembleSpy).not.toHaveBeenCalled()
  })

  it('GARBAGE-ONLY (?include=nonsense,money) fails CLOSED — 404, and no invoice data', async () => {
    const res = await call('?include=nonsense,money')
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).not.toMatch(MONEY)
    expect(body).not.toContain('BEGIN:VCALENDAR')
    expect(assembleSpy).not.toHaveBeenCalled()
  })

  it('MIXED valid + garbage keeps the valid kinds and drops the rest — never upgrading to "everything"', async () => {
    const res = await call('?include=event,nonsense,invoice_due')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('UID:event-e1@traxevent')
    expect(body).toContain('UID:invoice_due-i1@traxevent')
    expect(body).not.toContain('UID:task-t1@traxevent')
    expect(body).not.toContain('UID:drop-d1:w1@traxevent')
  })

  it('MIXED garbage + a single money kind serves ONLY money — the filter is obeyed literally', async () => {
    const res = await call('?include=%20invoice_due%20,bogus')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(MONEY)
    expect(body).not.toContain('UID:event-e1@traxevent')
  })
})

describe('GET /ics/[orgSlug]/[token] — token gate', () => {
  it('404s an unknown org and a wrong token without assembling anything', async () => {
    orgGetSpy.mockResolvedValue({ empty: true, docs: [] })
    expect((await call()).status).toBe(404)

    orgGetSpy.mockResolvedValue({ empty: false, docs: [ORG_DOC] })
    const wrong = await GET(new Request('https://app.example/ics/acme/nope'), {
      params: Promise.resolve({ orgSlug: 'acme', token: 'nope' }),
    })
    expect(wrong.status).toBe(404)
    expect(assembleSpy).not.toHaveBeenCalled()
  })

  it('404s when the org has no token at all (a bare guess must not mint access)', async () => {
    orgGetSpy.mockResolvedValue({ empty: false, docs: [{ id: 'org-1', data: () => ({ name: 'BrewTrax' }) }] })
    const res = await GET(new Request('https://app.example/ics/acme/undefined'), {
      params: Promise.resolve({ orgSlug: 'acme', token: 'undefined' }),
    })
    expect(res.status).toBe(404)
    expect(assembleSpy).not.toHaveBeenCalled()
  })
})
