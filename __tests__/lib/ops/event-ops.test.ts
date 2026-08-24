import { describe, it, expect, vi, beforeEach } from 'vitest'

const planSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const planUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const planGetSpy = vi.hoisted(() => vi.fn())
const opsDocIdSpy = vi.hoisted(() => vi.fn())
// orgs/{o}/events/{e}/ops/{docId} — the mock returns the same doc handle for any path
const opsDoc = vi.hoisted(() => ({ set: planSetSpy, update: planUpdateSpy, get: planGetSpy }))
vi.mock('@/lib/firebase-admin', () => {
  const opsColl = { doc: vi.fn((id?: string) => { opsDocIdSpy(id); return opsDoc }) }
  const eventDoc = { collection: vi.fn(() => opsColl) }
  const eventsColl = { doc: vi.fn(() => eventDoc) }
  const orgDoc = { collection: vi.fn(() => eventsColl) }
  return {
    adminDb: {
      collection: vi.fn(() => ({ doc: vi.fn(() => orgDoc) })),
      runTransaction: async (fn: (tx: { get: (ref: typeof opsDoc) => Promise<unknown>; update: (ref: typeof opsDoc, p: unknown) => unknown }) => unknown) =>
        fn({ get: (ref) => ref.get(), update: (ref, p) => ref.update(p) }),
    },
  }
})
vi.mock('@/lib/ops/work-packages', () => ({ getWorkPackagesByIdsCore: vi.fn() }))
vi.mock('@/lib/ops/resources', () => ({ listResourcesCore: vi.fn() }))
vi.mock('@/lib/ops/checklist-templates', () => ({ getTemplatesForOrg: vi.fn() }))

import { FieldValue } from 'firebase-admin/firestore'
import { getWorkPackagesByIdsCore } from '@/lib/ops/work-packages'
import { listResourcesCore } from '@/lib/ops/resources'
import { getTemplatesForOrg } from '@/lib/ops/checklist-templates'
import {
  instantiateOpsPlanCore, updateOpsRequirementsCore, recomputeOpsListsCore,
  confirmReadyCore, clearReadyConfirmedCore,
} from '@/lib/ops/event-ops'
import type { OpsPlan } from '@/lib/types'

// FieldValue.delete() sentinel — same instance class the cores write.
const DELETE_SENTINEL = FieldValue.delete()

const PKG = {
  id: 'wp1', name: 'Espresso Bar', price: 1200, created_at: 't',
  lines: [
    { kind: 'consumable' as const, resource_id: 'res-beans', qty_per_guest: 0.75 },
    { kind: 'equipment' as const, resource_id: 'res-machine', qty: 1 },
  ],
}
const RES = [
  { id: 'res-beans', name: 'Beans', kind: 'consumable' as const, unit: 'oz', unit_cost: 0.55, created_at: 't' },
  { id: 'res-machine', name: 'Machine', kind: 'serialized' as const, created_at: 't' },
]
const TPL = [{ id: 'bi-cc-prep', name: 'Prep', phase: 'prep' as const, steps: [{ text: 'x', evidence: 'none' as const }], created_at: 't' }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getWorkPackagesByIdsCore).mockResolvedValue([PKG])
  vi.mocked(listResourcesCore).mockResolvedValue(RES)
  vi.mocked(getTemplatesForOrg).mockResolvedValue(TPL)
  planGetSpy.mockResolvedValue({ exists: false })
})

describe('instantiateOpsPlanCore', () => {
  const input = {
    package_ids: ['wp1'],
    requirements: { guests: 100 },
    event_start: '2026-09-12',
    industry_pack_id: 'coffee-cart',
    actor_uid: 'u1',
  }

  it('derives lists, deadlines, and checklists from packages + requirements', async () => {
    const plan = await instantiateOpsPlanCore('o1', 'e1', input)
    // 0.75 × 100 = 75 oz (weight) → 4.69 lb
    expect(plan.shopping_list).toEqual([{ resource_id: 'res-beans', name: 'Beans', qty: 4.69, unit: 'lb', checked: false }])
    expect(plan.packing_list).toEqual([{ resource_id: 'res-machine', name: 'Machine', qty: 1, checked: false }])
    expect(plan.deadlines.length).toBeGreaterThan(0)
    expect(plan.checklists[0].id).toBe('bi-cc-prep')
    expect(plan.needs_review).toBe(false)
    expect(plan.change_log[0]).toMatchObject({ by: 'u1', field: 'instantiated' })
    expect(planSetSpy).toHaveBeenCalled()
    expect(opsDocIdSpy).toHaveBeenCalledWith('plan')
  })

  it('rejects unknown package ids and non-positive guest counts', async () => {
    vi.mocked(getWorkPackagesByIdsCore).mockResolvedValue([])
    await expect(instantiateOpsPlanCore('o1', 'e1', input)).rejects.toThrow('Unknown package: wp1')
    await expect(instantiateOpsPlanCore('o1', 'e1', { ...input, requirements: { guests: 0 } }))
      .rejects.toThrow('Guest count must be positive')
  })

  it('rejects a non-finite (NaN) guest count', async () => {
    await expect(instantiateOpsPlanCore('o1', 'e1', { ...input, requirements: { guests: NaN } }))
      .rejects.toThrow('Guest count must be positive')
  })

  it('rejects when a plan already exists (no silent overwrite)', async () => {
    planGetSpy.mockResolvedValue({ exists: true })
    await expect(instantiateOpsPlanCore('o1', 'e1', input)).rejects.toThrow('Ops plan already exists for this event')
    expect(planSetSpy).not.toHaveBeenCalled()
  })

  it('strips undefined-valued keys from requirements before writing', async () => {
    const plan = await instantiateOpsPlanCore('o1', 'e1', {
      ...input,
      requirements: { guests: 100, service_start: undefined },
    })
    expect('service_start' in plan.requirements).toBe(false)
    const written = planSetSpy.mock.calls[0][0]
    expect('service_start' in written.requirements).toBe(false)
  })

  it('instantiates only the union of package-scoped checklist templates when any package specifies them', async () => {
    const withTpl = { ...PKG, checklist_template_ids: ['bi-cc-prep'] }
    const otherTpl = { id: 'bi-cc-loadout', name: 'Load-out', phase: 'load-out' as const, steps: [{ text: 'y', evidence: 'none' as const }], created_at: 't' }
    vi.mocked(getWorkPackagesByIdsCore).mockResolvedValue([withTpl])
    vi.mocked(getTemplatesForOrg).mockResolvedValue([...TPL, otherTpl])
    const plan = await instantiateOpsPlanCore('o1', 'e1', input)
    expect(plan.checklists.map((c) => c.id)).toEqual(['bi-cc-prep'])
  })

  it('instantiates all templates when no package specifies checklist_template_ids', async () => {
    const otherTpl = { id: 'bi-cc-loadout', name: 'Load-out', phase: 'load-out' as const, steps: [{ text: 'y', evidence: 'none' as const }], created_at: 't' }
    vi.mocked(getTemplatesForOrg).mockResolvedValue([...TPL, otherTpl])
    const plan = await instantiateOpsPlanCore('o1', 'e1', input)
    expect(plan.checklists.map((c) => c.id).sort()).toEqual(['bi-cc-loadout', 'bi-cc-prep'])
  })
})

describe('updateOpsRequirementsCore', () => {
  const existing: OpsPlan = {
    package_ids: ['wp1'],
    requirements: { guests: 100, site_needs: ['power'] },
    deadlines: [], packing_list: [{ resource_id: 'res-machine', name: 'Machine', qty: 1, checked: false }],
    // unit is 'lb' to match what computeShoppingList actually derives for this
    // resource/guest range (formatQuantity picks the human-scale unit) — the
    // carry-forward key is resource_id + unit, so it must match the recompute.
    shopping_list: [{ resource_id: 'res-beans', name: 'Beans', qty: 75, unit: 'lb', checked: true }],
    checklists: [], needs_review: false, change_log: [],
    industry_pack_id: 'coffee-cart', created_at: 't',
  }

  it('guest change: recomputes shopping list, sets needs_review, logs the change, leaves packing_list alone', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => existing })
    await updateOpsRequirementsCore('o1', 'e1', { guests: 120 }, 'u2')
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload['requirements.guests']).toBe(120)
    expect(payload.needs_review).toBe(true)
    expect(payload.shopping_list[0].qty).toBe(5.63) // 0.75 × 120 = 90 oz → 5.63 lb
    expect('packing_list' in payload).toBe(false)
    // change_log appended via FieldValue.arrayUnion — an opaque sentinel, not a plain array
    expect(Array.isArray(payload.change_log)).toBe(false)
    const entry = payload.change_log.elements[payload.change_log.elements.length - 1]
    expect(entry).toMatchObject({ by: 'u2', field: 'guests', from: '100', to: '120' })
  })

  it('guest change: carries forward `checked` on the shopping list by resource_id', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => existing })
    await updateOpsRequirementsCore('o1', 'e1', { guests: 120 }, 'u2')
    const payload = planUpdateSpy.mock.calls[0][0]
    // 'res-beans' was checked:true in the previous shopping_list — must remain checked
    expect(payload.shopping_list.find((i: { resource_id: string }) => i.resource_id === 'res-beans').checked).toBe(true)
  })

  it('non-quantity change: logs but does not re-derive or flag', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => existing })
    await updateOpsRequirementsCore('o1', 'e1', { notes: 'Use side entrance' }, 'u2')
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.needs_review).toBeUndefined()
    expect(payload.shopping_list).toBeUndefined()
    expect(payload['requirements.notes']).toBe('Use side entrance')
  })

  it('throws when no plan exists', async () => {
    planGetSpy.mockResolvedValue({ exists: false })
    await expect(updateOpsRequirementsCore('o1', 'e1', { guests: 5 }, 'u1')).rejects.toThrow('No ops plan')
    expect(opsDocIdSpy).toHaveBeenCalledWith('plan')
  })

  it('rejects unknown requirement fields', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => existing })
    // @ts-expect-error invalid field at runtime
    await expect(updateOpsRequirementsCore('o1', 'e1', { budget: 500 }, 'u1')).rejects.toThrow('Unknown requirement field: budget')
  })

  it('rejects a non-finite (NaN) guest count', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => existing })
    await expect(updateOpsRequirementsCore('o1', 'e1', { guests: NaN }, 'u1')).rejects.toThrow('Guest count must be positive')
  })

  it('throws when a re-derive discovers a package that no longer exists', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => existing })
    vi.mocked(getWorkPackagesByIdsCore).mockResolvedValue([])
    await expect(updateOpsRequirementsCore('o1', 'e1', { guests: 120 }, 'u2')).rejects.toThrow('Package no longer exists: wp1')
  })

  // ── Confirm-ready clearing path (a) — inc-2 P2 ─────────────────────────────

  it('clears ready_confirmed on ANY logged change — a non-guests field like site_needs counts', async () => {
    planGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ ...existing, ready_confirmed: { at: 't0', by: 'u9' } }),
    })
    await updateOpsRequirementsCore('o1', 'e1', { site_needs: ['power', 'water'] }, 'u2')
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.ready_confirmed).toEqual(DELETE_SENTINEL)
  })

  it('clears ready_confirmed on a service_start change too', async () => {
    planGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ ...existing, ready_confirmed: { at: 't0', by: 'u9' } }),
    })
    await updateOpsRequirementsCore('o1', 'e1', { service_start: '2026-09-12T15:00' }, 'u2')
    expect(planUpdateSpy.mock.calls[0][0].ready_confirmed).toEqual(DELETE_SENTINEL)
  })

  it('does NOT clear on a same-value write (no logged entry → no write at all)', async () => {
    planGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ ...existing, ready_confirmed: { at: 't0', by: 'u9' } }),
    })
    await updateOpsRequirementsCore('o1', 'e1', { site_needs: ['power'] }, 'u2')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })
})

describe('recomputeOpsListsCore (spec 2026-08-19 B5)', () => {
  const existing: OpsPlan = {
    package_ids: ['wp1'],
    requirements: { guests: 100 },
    deadlines: [],
    // packing checked:true so the carry-forward is asserted on BOTH lists.
    packing_list: [{ resource_id: 'res-machine', name: 'Machine', qty: 1, checked: true }],
    shopping_list: [{ resource_id: 'res-beans', name: 'Beans', qty: 4.69, unit: 'lb', checked: true }],
    checklists: [], needs_review: false, change_log: [],
    industry_pack_id: 'coffee-cart', created_at: 't',
  }

  beforeEach(() => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => existing })
  })

  it('re-derives both lists from CURRENT packages after a package edit, preserving checked by resource_id|unit', async () => {
    // The package was edited: 0.75 → 1.5 oz per guest. No requirement changed,
    // so updateOpsRequirementsCore would short-circuit — this core must not.
    vi.mocked(getWorkPackagesByIdsCore).mockResolvedValue([{
      ...PKG,
      lines: [
        { kind: 'consumable' as const, resource_id: 'res-beans', qty_per_guest: 1.5 },
        { kind: 'equipment' as const, resource_id: 'res-machine', qty: 2 },
      ],
    }])
    const result = await recomputeOpsListsCore('o1', 'e1', 'u3')
    const payload = planUpdateSpy.mock.calls[0][0]
    // 1.5 × 100 = 150 oz → 9.38 lb; checked:true carried over (same resource_id|unit key)
    expect(payload.shopping_list).toEqual([{ resource_id: 'res-beans', name: 'Beans', qty: 9.38, unit: 'lb', checked: true }])
    // packing list re-derived too (qty 1 → 2), checked preserved
    expect(payload.packing_list).toEqual([{ resource_id: 'res-machine', name: 'Machine', qty: 2, checked: true }])
    // a plain recompute is NOT the guests path: no review flag, no guests write
    expect(payload.needs_review).toBeUndefined()
    expect(payload['requirements.guests']).toBeUndefined()
    // change_log appended via FieldValue.arrayUnion — an opaque sentinel, not a plain array
    expect(Array.isArray(payload.change_log)).toBe(false)
    expect(payload.change_log.elements[payload.change_log.elements.length - 1]).toMatchObject({ by: 'u3', field: 'recomputed' })
    // returns the fresh plan so callers can swap client state without a re-read
    expect(result.shopping_list).toEqual(payload.shopping_list)
    expect(result.packing_list).toEqual(payload.packing_list)
  })

  it('writes even when nothing changed (no same-value short-circuit)', async () => {
    await recomputeOpsListsCore('o1', 'e1', 'u3')
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.shopping_list).toEqual([{ resource_id: 'res-beans', name: 'Beans', qty: 4.69, unit: 'lb', checked: true }])
    expect(payload.updated_at).toEqual(expect.any(String))
  })

  it('guests option (headcount hook path): syncs requirements.guests, sets needs_review, logs both entries', async () => {
    await recomputeOpsListsCore('o1', 'e1', 'u3', { guests: 120 })
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.shopping_list[0].qty).toBe(5.63) // 0.75 × 120 = 90 oz → 5.63 lb
    expect(payload.shopping_list[0].checked).toBe(true)
    expect(payload['requirements.guests']).toBe(120)
    expect(payload.needs_review).toBe(true)
    const fields = payload.change_log.elements.map((e: { field: string }) => e.field)
    expect(fields).toContain('recomputed')
    expect(payload.change_log.elements.find((e: { field: string }) => e.field === 'guests'))
      .toMatchObject({ by: 'u3', from: '100', to: '120' })
  })

  it('guests option equal to the plan is a plain recompute (no review flag)', async () => {
    await recomputeOpsListsCore('o1', 'e1', 'u3', { guests: 100 })
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.needs_review).toBeUndefined()
    expect(payload['requirements.guests']).toBeUndefined()
  })

  it('fails visibly when a package no longer resolves', async () => {
    vi.mocked(getWorkPackagesByIdsCore).mockResolvedValue([])
    await expect(recomputeOpsListsCore('o1', 'e1', 'u3')).rejects.toThrow('Package no longer exists: wp1')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws when no plan exists', async () => {
    planGetSpy.mockResolvedValue({ exists: false })
    await expect(recomputeOpsListsCore('o1', 'e1', 'u3')).rejects.toThrow('No ops plan')
  })

  it('rejects a non-positive guests option', async () => {
    await expect(recomputeOpsListsCore('o1', 'e1', 'u3', { guests: 0 })).rejects.toThrow('Guest count must be positive')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })

  // ── Confirm-ready clearing path (b) — inc-2 P2: BOTH callers route here ────

  it('clears ready_confirmed on every recompute AND strips it from the returned plan', async () => {
    planGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ ...existing, ready_confirmed: { at: 't0', by: 'u9' } }),
    })
    const result = await recomputeOpsListsCore('o1', 'e1', 'u3')
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.ready_confirmed).toEqual(DELETE_SENTINEL)
    // The returned plan feeds client state — the cleared attestation must not linger.
    expect('ready_confirmed' in result).toBe(false)
  })

  it('clears ready_confirmed on the headcount-hook (guests) path too', async () => {
    planGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ ...existing, ready_confirmed: { at: 't0', by: 'u9' } }),
    })
    await recomputeOpsListsCore('o1', 'e1', 'u3', { guests: 120 })
    expect(planUpdateSpy.mock.calls[0][0].ready_confirmed).toEqual(DELETE_SENTINEL)
  })
})

describe('confirmReadyCore / clearReadyConfirmedCore (inc-2 P2)', () => {
  const existing: OpsPlan = {
    package_ids: ['wp1'],
    requirements: { guests: 100 },
    deadlines: [], packing_list: [], shopping_list: [],
    checklists: [], needs_review: false, change_log: [],
    created_at: 't',
  }

  it('confirmReadyCore stamps {at, by}, logs the attestation, and returns the stamp', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: () => existing })
    const stamp = await confirmReadyCore('o1', 'e1', 'u7')
    expect(stamp).toEqual({ at: expect.any(String), by: 'u7' })
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.ready_confirmed).toEqual(stamp)
    expect(payload.change_log.elements[0]).toMatchObject({ by: 'u7', field: 'ready_confirmed' })
    expect(payload.updated_at).toBe(stamp.at)
  })

  it('confirmReadyCore throws when no plan exists — nothing to attest to', async () => {
    planGetSpy.mockResolvedValue({ exists: false })
    await expect(confirmReadyCore('o1', 'e1', 'u7')).rejects.toThrow('No ops plan')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })

  it('clearReadyConfirmedCore deletes the field and logs, when an attestation stands', async () => {
    planGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ ...existing, ready_confirmed: { at: 't0', by: 'u9' } }),
    })
    await clearReadyConfirmedCore('o1', 'e1', 'u2')
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.ready_confirmed).toEqual(DELETE_SENTINEL)
    expect(payload.change_log.elements[0]).toMatchObject({ by: 'u2', field: 'ready_confirm_cleared' })
  })

  it('clearReadyConfirmedCore is a silent no-op without a plan or without an attestation', async () => {
    planGetSpy.mockResolvedValue({ exists: false })
    await clearReadyConfirmedCore('o1', 'e1', 'u2')
    planGetSpy.mockResolvedValue({ exists: true, data: () => existing })
    await clearReadyConfirmedCore('o1', 'e1', 'u2')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })
})
