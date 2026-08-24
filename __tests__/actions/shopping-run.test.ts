import { describe, it, expect, vi, beforeEach } from 'vitest'

// Per-event plan doc mocks: opsPlanRef(orgId, eventId) resolves to a distinct
// ref per eventId so the multi-doc transaction's reads/writes are observable
// per plan.
const makeDoc = vi.hoisted(() => () => ({ get: vi.fn(), update: vi.fn() }))
const docs = vi.hoisted(() => new Map<string, ReturnType<typeof makeDoc>>())
const docFor = vi.hoisted(() => (eventId: string) => {
  let d = docs.get(eventId)
  if (!d) {
    d = makeDoc()
    docs.set(eventId, d)
  }
  return d
})
const txSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const eventsColl = {
    doc: vi.fn((eventId: string) => ({
      collection: vi.fn(() => ({ doc: vi.fn(() => docFor(eventId)) })),
    })),
  }
  const orgDoc = { collection: vi.fn(() => eventsColl) }
  type Ref = ReturnType<typeof docFor>
  return {
    adminDb: {
      collection: vi.fn(() => ({ doc: vi.fn(() => orgDoc) })),
      runTransaction: async (fn: (tx: { get: (ref: Ref) => Promise<unknown>; update: (ref: Ref, p: unknown) => unknown }) => unknown) => {
        txSpy()
        return fn({ get: (ref) => ref.get(), update: (ref, p) => ref.update(p) })
      },
    },
  }
})
vi.mock('@/lib/auth/assert', () => ({
  assertEventPage: vi.fn().mockResolvedValue({ uid: 'member-1', role: 'staff', event_access: {} }),
}))
// lib/ops/event-ops (imported for opsPlanRef) pulls these in transitively.
vi.mock('@/lib/ops/work-packages', () => ({ getWorkPackagesByIdsCore: vi.fn() }))
vi.mock('@/lib/ops/resources', () => ({ listResourcesCore: vi.fn() }))
vi.mock('@/lib/ops/checklist-templates', () => ({ getTemplatesForOrg: vi.fn() }))

import { assertEventPage } from '@/lib/auth/assert'
import { bulkSetRunCheckedCore } from '@/lib/ops/shopping-run-write'
import { bulkSetRunChecked } from '@/actions/shopping-run'
import type { OpsListItem } from '@/lib/types'

function planWith(shopping: OpsListItem[]) {
  return {
    package_ids: ['p1'],
    requirements: { guests: 50 },
    deadlines: [],
    shopping_list: shopping,
    packing_list: [],
    checklists: [],
    needs_review: false,
    change_log: [],
    created_at: 't',
  }
}

function seedPlan(eventId: string, shopping: OpsListItem[]) {
  docFor(eventId).get.mockResolvedValue({ exists: true, data: () => planWith(shopping) })
}

beforeEach(() => {
  vi.clearAllMocks()
  docs.clear()
})

describe('bulkSetRunCheckedCore (run-row check-all across plans)', () => {
  it('updates the named keys on EVERY plan in ONE multi-doc transaction', async () => {
    seedPlan('e1', [
      { resource_id: 'r-milk', name: 'Milk', qty: 2, unit: 'quart', checked: false },
      { resource_id: 'r-cups', name: 'Cups', qty: 75, checked: false },
    ])
    seedPlan('e2', [{ resource_id: 'r-milk', name: 'Milk', qty: 1, unit: 'gal', checked: false }])
    await bulkSetRunCheckedCore('o1', [
      { event_id: 'e1', keys: [{ resource_id: 'r-milk', unit: 'quart' }] },
      { event_id: 'e2', keys: [{ resource_id: 'r-milk', unit: 'gal' }] },
    ], true)
    expect(txSpy).toHaveBeenCalledTimes(1)
    const p1 = docFor('e1').update.mock.calls[0][0]
    expect(p1.shopping_list[0]).toMatchObject({ resource_id: 'r-milk', checked: true })
    expect(p1.shopping_list[1]).toMatchObject({ resource_id: 'r-cups', checked: false }) // not named — untouched
    expect(p1.updated_at).toEqual(expect.any(String))
    const p2 = docFor('e2').update.mock.calls[0][0]
    expect(p2.shopping_list[0]).toMatchObject({ resource_id: 'r-milk', checked: true })
  })

  it('unchecks too', async () => {
    seedPlan('e1', [{ resource_id: 'r-milk', name: 'Milk', qty: 1, unit: 'gal', checked: true }])
    await bulkSetRunCheckedCore('o1', [{ event_id: 'e1', keys: [{ resource_id: 'r-milk', unit: 'gal' }] }], false)
    expect(docFor('e1').update.mock.calls[0][0].shopping_list[0].checked).toBe(false)
  })

  it('matches items by resource_id|unit — the same convention as toggleListItemCore', async () => {
    seedPlan('e1', [
      { resource_id: 'r-beans', name: 'Beans', qty: 5, unit: 'lb', checked: false },
      { resource_id: 'r-beans', name: 'Beans', qty: 3, unit: 'shot', checked: false, needs_conversion: true },
    ])
    await bulkSetRunCheckedCore('o1', [{ event_id: 'e1', keys: [{ resource_id: 'r-beans', unit: 'lb' }] }], true)
    const p = docFor('e1').update.mock.calls[0][0]
    expect(p.shopping_list[0]).toMatchObject({ unit: 'lb', checked: true })
    expect(p.shopping_list[1]).toMatchObject({ unit: 'shot', checked: false })
  })

  it('fails the WHOLE write visibly when any key does not resolve — no partial cross-plan state', async () => {
    seedPlan('e1', [{ resource_id: 'r-milk', name: 'Milk', qty: 1, unit: 'gal', checked: false }])
    seedPlan('e2', [{ resource_id: 'r-milk', name: 'Milk', qty: 1, unit: 'gal', checked: false }])
    await expect(bulkSetRunCheckedCore('o1', [
      { event_id: 'e1', keys: [{ resource_id: 'r-milk', unit: 'gal' }] },
      { event_id: 'e2', keys: [{ resource_id: 'r-nope' }] },
    ], true)).rejects.toThrow('Item not found')
    // Writes are staged after ALL targets validate — nothing was written.
    expect(docFor('e1').update).not.toHaveBeenCalled()
    expect(docFor('e2').update).not.toHaveBeenCalled()
  })

  it('throws when a plan doc is missing', async () => {
    docFor('e1').get.mockResolvedValue({ exists: false })
    await expect(
      bulkSetRunCheckedCore('o1', [{ event_id: 'e1', keys: [{ resource_id: 'r-milk' }] }], true),
    ).rejects.toThrow('No ops plan for this event')
  })

  it('no-ops on empty targets without opening a transaction', async () => {
    await bulkSetRunCheckedCore('o1', [], true)
    expect(txSpy).not.toHaveBeenCalled()
  })
})

describe('bulkSetRunChecked (action)', () => {
  it('gates on assertEventPage(orgId, event_id, "ops") for EVERY targeted event', async () => {
    seedPlan('e1', [{ resource_id: 'r1', name: 'A', qty: 1, checked: false }])
    seedPlan('e2', [{ resource_id: 'r1', name: 'A', qty: 1, checked: false }])
    await bulkSetRunChecked('o1', [
      { event_id: 'e1', keys: [{ resource_id: 'r1' }] },
      { event_id: 'e2', keys: [{ resource_id: 'r1' }] },
    ], true)
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e1', 'ops')
    expect(assertEventPage).toHaveBeenCalledWith('o1', 'e2', 'ops')
    expect(docFor('e1').update).toHaveBeenCalled()
  })

  it('a Forbidden event blocks the whole write', async () => {
    seedPlan('e1', [{ resource_id: 'r1', name: 'A', qty: 1, checked: false }])
    vi.mocked(assertEventPage).mockRejectedValueOnce(new Error('Forbidden'))
    await expect(
      bulkSetRunChecked('o1', [{ event_id: 'e1', keys: [{ resource_id: 'r1' }] }], true),
    ).rejects.toThrow('Forbidden')
    expect(txSpy).not.toHaveBeenCalled()
  })
})
