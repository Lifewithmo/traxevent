import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The closeout page is an async server component: mock the guard + cores so
// none of the firebase-admin graph is pulled in, await the component, render
// the tree. These tests pin the D4 threading END-TO-END: the prior day's
// stored `sales_source` must survive loadPriorDayHint and reach the ghost
// hint's Square mark — a client-only test of the `imported` prop cannot catch
// the page dropping the field.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`unexpected redirect: ${url}`) }),
}))

const requireEventSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/guards', () => ({ requireEvent: requireEventSpy }))

const getCloseoutSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ops/closeout', () => ({ getCloseoutCore: getCloseoutSpy }))

const listResourcesSpy = vi.hoisted(() => vi.fn(async () => []))
vi.mock('@/lib/ops/resources', () => ({ listResourcesCore: listResourcesSpy }))

const listSeriesDaysSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/occasions/series', () => ({ listSeriesDaysCore: listSeriesDaysSpy }))

// The rendered client component calls server actions on interaction only,
// but the import alone would pull the firebase-admin graph — mock it out.
vi.mock('@/actions/event-ops', () => ({
  saveActuals: vi.fn(),
  completeCloseout: vi.fn(),
}))

import MarketDayCloseoutPage from '@/app/(admin)/[orgSlug]/[eventSlug]/closeout/page'

const params = Promise.resolve({ orgSlug: 'acme', eventSlug: 'farmers-market' })

/** Current day e2 (Sat 2026-08-22) in series s1, prior day e1 a week before. */
function arrange(priorActuals: { sales?: number; sales_source?: 'square_csv' | 'manual' }) {
  requireEventSpy.mockResolvedValue({
    orgId: 'o1',
    eventId: 'e2',
    member: { role: 'owner' },
    event: {
      id: 'e2', kind: 'market_day', series_id: 's1',
      event_start: '2026-08-22T09:00:00', booth_fee: 35,
    },
  })
  listSeriesDaysSpy.mockResolvedValue([
    { id: 'e1', event_start: '2026-08-15T09:00:00' },
    { id: 'e2', event_start: '2026-08-22T09:00:00' },
  ])
  getCloseoutSpy.mockImplementation(async (_orgId: string, eventId: string) =>
    eventId === 'e1'
      ? { actuals: priorActuals, completed: true, created_at: 't' }
      : null)
}

beforeEach(() => vi.clearAllMocks())

describe('Market-day closeout page — ghost hint provenance threading (D4, B3)', () => {
  it("threads the prior day's sales_source='square_csv' into the hint's Square mark", async () => {
    arrange({ sales: 180, sales_source: 'square_csv' })
    render(await MarketDayCloseoutPage({ params }))
    // The hint renders the imported figure WITH the season strip's idiom —
    // fine-print " · Square", titled with the source.
    expect(screen.getByText(/Last Saturday: \$180/)).toHaveTextContent('Last Saturday: $180 · Square')
    expect(screen.getByTitle('Sales imported from a Square export')).toBeInTheDocument()
  })

  it('a manually-recorded prior day renders the hint with NO imported mark', async () => {
    arrange({ sales: 180, sales_source: 'manual' })
    render(await MarketDayCloseoutPage({ params }))
    expect(screen.getByText('Last Saturday: $180')).toBeInTheDocument()
    expect(screen.queryByTitle('Sales imported from a Square export')).not.toBeInTheDocument()
    expect(screen.queryByText(/· Square/)).not.toBeInTheDocument()
  })

  it('a legacy prior day with no sales_source at all also renders unmarked', async () => {
    arrange({ sales: 180 })
    render(await MarketDayCloseoutPage({ params }))
    expect(screen.getByText('Last Saturday: $180')).toBeInTheDocument()
    expect(screen.queryByTitle('Sales imported from a Square export')).not.toBeInTheDocument()
  })
})
