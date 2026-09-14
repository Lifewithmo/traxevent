import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

// Shelf notes (inc-3 S3.3) are DISPLAY-ONLY on paper: both print routes must
// render them read-only — the loadout print per item, the shopping-run print
// per constituent — so what the operator wrote at the shelf survives into the
// dead-zone copy. (Editing lives on the load-out screen alone; B5.)

const requireEventPageSpy = vi.hoisted(() => vi.fn())
const requireOrgMemberSpy = vi.hoisted(() => vi.fn())
const allowedEventPagesSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/guards', () => ({
  requireEventPage: requireEventPageSpy,
  requireOrgMember: requireOrgMemberSpy,
  allowedEventPages: allowedEventPagesSpy,
}))

const getOpsPlanSpy = vi.hoisted(() => vi.fn())
vi.mock('@/actions/event-ops', () => ({ getOpsPlan: getOpsPlanSpy }))

const getOpsPlanCoreSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ops/event-ops', () => ({ getOpsPlanCore: getOpsPlanCoreSpy }))

const listEventsCoreSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/events', () => ({ listEventsCore: listEventsCoreSpy }))

const listResourcesCoreSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ops/resources', () => ({ listResourcesCore: listResourcesCoreSpy }))

vi.mock('@/lib/opportunity-detail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/opportunity-detail')>()),
  todayYmd: () => '2026-08-10',
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: (_name: string) => null })),
}))

const orgDocGetSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/firebase-admin', () => {
  const orgDoc = { get: orgDocGetSpy }
  return { adminDb: { collection: () => ({ doc: () => orgDoc }) } }
})

import OpsPrintPage from '@/app/(admin)/[orgSlug]/[eventSlug]/ops/print/page'
import ShoppingRunPrintPage from '@/app/(admin)/[orgSlug]/shopping-run/print/page'
import type { OpsPlan } from '@/lib/types'

function plan(overrides: Partial<OpsPlan> = {}): OpsPlan {
  return {
    package_ids: ['p1'],
    requirements: { guests: 60 },
    deadlines: [],
    shopping_list: [
      { resource_id: 'r-milk', name: 'Milk', qty: 3, unit: 'gal', checked: true, note: 'subbed with oat milk — 2 cartons' },
    ],
    packing_list: [
      { resource_id: 'r-keg', name: 'Kegerator', qty: 1, checked: false, note: 'left hinge sticks' },
    ],
    checklists: [],
    needs_review: false,
    change_log: [],
    created_at: '2026-08-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  orgDocGetSpy.mockResolvedValue({ data: () => ({}) })
})

describe('load-out print (ops/print) — notes on paper', () => {
  it('renders each item note read-only under its row', async () => {
    requireEventPageSpy.mockResolvedValue({
      orgId: 'o1', eventId: 'e1',
      event: { name: 'Smith Wedding', slug: 'smith-wedding', event_start: '2026-08-12' },
    })
    getOpsPlanSpy.mockResolvedValue(plan())
    const ui = (await OpsPrintPage({
      params: Promise.resolve({ orgSlug: 'demo', eventSlug: 'smith-wedding' }),
    })) as ReactElement
    render(ui)
    expect(screen.getByText('subbed with oat milk — 2 cartons')).toBeInTheDocument()
    expect(screen.getByText('left hinge sticks')).toBeInTheDocument()
    // Read-only: paper carries no inputs.
    expect(document.querySelector('input')).toBeNull()
  })
})

describe('shopping-run print — notes on paper', () => {
  it('renders each constituent note read-only in the per-job breakdown', async () => {
    requireOrgMemberSpy.mockResolvedValue({ orgId: 'o1', member: { uid: 'u1', role: 'owner' } })
    allowedEventPagesSpy.mockReturnValue(['ops'])
    listEventsCoreSpy.mockResolvedValue([
      {
        id: 'e1', name: 'Smith Wedding', slug: 'smith-wedding', year: 2026, status: 'active',
        event_type_id: 'general', event_start: '2026-08-12', event_end: '2026-08-12',
        created_at: '2026-08-01T00:00:00.000Z',
      },
    ])
    getOpsPlanCoreSpy.mockResolvedValue(plan())
    listResourcesCoreSpy.mockResolvedValue([
      { id: 'r-milk', name: 'Milk', kind: 'consumable', unit: 'gal', dimension: 'volume', created_at: 't' },
    ])
    const ui = (await ShoppingRunPrintPage({
      params: Promise.resolve({ orgSlug: 'demo' }),
      searchParams: Promise.resolve({}),
    })) as ReactElement
    render(ui)
    expect(screen.getByText('subbed with oat milk — 2 cartons')).toBeInTheDocument()
    expect(document.querySelector('input')).toBeNull()
  })
})
