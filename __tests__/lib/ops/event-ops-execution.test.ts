import { describe, it, expect, vi, beforeEach } from 'vitest'

const planUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const planGetSpy = vi.hoisted(() => vi.fn())
const opsDocIdSpy = vi.hoisted(() => vi.fn())
const opsDoc = vi.hoisted(() => ({ set: vi.fn(), update: planUpdateSpy, get: planGetSpy }))
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

import {
  toggleListItemCore, bulkSetListCheckedCore, completeChecklistStepCore, toggleDeadlineCore, acknowledgeReviewCore,
} from '@/lib/ops/event-ops'
import type { OpsPlan } from '@/lib/types'

const plan = (): OpsPlan => ({
  package_ids: ['wp1'],
  requirements: { guests: 100 },
  deadlines: [{ id: 'dl-final-payment', label: 'Final payment', due: '2026-09-09', done: false }],
  shopping_list: [{ resource_id: 'res-beans', name: 'Beans', qty: 75, checked: false }],
  packing_list: [{ resource_id: 'res-machine', name: 'Machine', qty: 1, checked: false }],
  checklists: [{
    id: 'bi-cc-prep', name: 'Prep', phase: 'prep',
    steps: [
      { text: 'Test machine', evidence: 'photo', done: false },
      { text: 'Label batches', evidence: 'none', done: false },
    ],
  }],
  needs_review: true, change_log: [], created_at: 't',
})

beforeEach(() => {
  vi.clearAllMocks()
  planGetSpy.mockResolvedValue({ exists: true, data: plan })
})

describe('toggleListItemCore', () => {
  it('checks the matching item, leaves others intact', async () => {
    await toggleListItemCore('o1', 'e1', 'shopping_list', 'res-beans', true)
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.shopping_list[0].checked).toBe(true)
    expect(opsDocIdSpy).toHaveBeenCalledWith('plan')
  })

  it('throws for an unknown item', async () => {
    await expect(toggleListItemCore('o1', 'e1', 'packing_list', 'res-nope', true)).rejects.toThrow('Item not found')
  })

  it('disambiguates two items sharing resource_id by unit — toggling one leaves the other unchecked', async () => {
    planGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        ...plan(),
        shopping_list: [
          { resource_id: 'res-beans', name: 'Beans', qty: 5, unit: 'lb', checked: false },
          { resource_id: 'res-beans', name: 'Beans', qty: 3, unit: 'shot', checked: false, needs_conversion: true },
        ],
      }),
    })
    await toggleListItemCore('o1', 'e1', 'shopping_list', 'res-beans', true, 'lb')
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.shopping_list[0]).toMatchObject({ unit: 'lb', checked: true })
    expect(payload.shopping_list[1]).toMatchObject({ unit: 'shot', checked: false })
  })
})

describe('bulkSetListCheckedCore (load-out check-all)', () => {
  const twoItemPlan = () => ({
    ...plan(),
    shopping_list: [
      { resource_id: 'res-beans', name: 'Beans', qty: 5, unit: 'lb', checked: false },
      { resource_id: 'res-cups', name: 'Cups', qty: 120, checked: true },
    ],
  })

  it('checks every item in the list in ONE transactional write, not N toggles', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: twoItemPlan })
    await bulkSetListCheckedCore('o1', 'e1', 'shopping_list', true)
    expect(planUpdateSpy).toHaveBeenCalledTimes(1)
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.shopping_list.map((i: { checked: boolean }) => i.checked)).toEqual([true, true])
    expect(payload.updated_at).toEqual(expect.any(String))
  })

  it('targets only the named keys (resource_id|unit), leaving others untouched', async () => {
    planGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        ...plan(),
        shopping_list: [
          { resource_id: 'res-beans', name: 'Beans', qty: 5, unit: 'lb', checked: false },
          { resource_id: 'res-cups', name: 'Cups', qty: 120, checked: false },
        ],
      }),
    })
    await bulkSetListCheckedCore('o1', 'e1', 'shopping_list', true, [{ resource_id: 'res-beans', unit: 'lb' }])
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.shopping_list[0]).toMatchObject({ resource_id: 'res-beans', checked: true })
    expect(payload.shopping_list[1]).toMatchObject({ resource_id: 'res-cups', checked: false }) // not named — untouched
  })

  it('unchecks a whole list too', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: twoItemPlan })
    await bulkSetListCheckedCore('o1', 'e1', 'shopping_list', false)
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.shopping_list.map((i: { checked: boolean }) => i.checked)).toEqual([false, false])
  })

  it('fails visibly when a named key does not resolve', async () => {
    planGetSpy.mockResolvedValue({ exists: true, data: twoItemPlan })
    await expect(bulkSetListCheckedCore('o1', 'e1', 'shopping_list', true, [{ resource_id: 'res-nope' }]))
      .rejects.toThrow('Item not found')
    expect(planUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws when no plan exists', async () => {
    planGetSpy.mockResolvedValue({ exists: false })
    await expect(bulkSetListCheckedCore('o1', 'e1', 'packing_list', true)).rejects.toThrow('No ops plan')
  })
})

describe('completeChecklistStepCore', () => {
  it('marks the step with actor + timestamp and stores evidence', async () => {
    await completeChecklistStepCore('o1', 'e1', 'bi-cc-prep', 0, { done: true, evidence_value: 'https://x/photo.jpg', actor_uid: 'u1' })
    const payload = planUpdateSpy.mock.calls[0][0]
    const step = payload.checklists[0].steps[0]
    expect(step.done).toBe(true)
    expect(step.evidence_value).toBe('https://x/photo.jpg')
    expect(step.done_by).toBe('u1')
    expect(step.done_at).toBeTruthy()
    expect(payload.checklists[0].steps[1].done).toBe(false)
  })

  it('un-done clears completion metadata', async () => {
    await completeChecklistStepCore('o1', 'e1', 'bi-cc-prep', 0, { done: false, actor_uid: 'u1' })
    const step = planUpdateSpy.mock.calls[0][0].checklists[0].steps[0]
    expect(step.done).toBe(false)
    expect('done_at' in step).toBe(false)
    expect('done_by' in step).toBe(false)
    expect('evidence_value' in step).toBe(false)
  })

  it('throws for unknown checklist or out-of-range step', async () => {
    await expect(completeChecklistStepCore('o1', 'e1', 'nope', 0, { done: true, actor_uid: 'u1' })).rejects.toThrow('Checklist not found')
    await expect(completeChecklistStepCore('o1', 'e1', 'bi-cc-prep', 9, { done: true, actor_uid: 'u1' })).rejects.toThrow('Step not found')
  })
})

describe('toggleDeadlineCore', () => {
  it('marks the deadline done', async () => {
    await toggleDeadlineCore('o1', 'e1', 'dl-final-payment', true)
    expect(planUpdateSpy.mock.calls[0][0].deadlines[0].done).toBe(true)
  })
})

describe('acknowledgeReviewCore', () => {
  it('clears needs_review and logs who acknowledged', async () => {
    await acknowledgeReviewCore('o1', 'e1', 'u9')
    const payload = planUpdateSpy.mock.calls[0][0]
    expect(payload.needs_review).toBe(false)
    // change_log appended via FieldValue.arrayUnion — an opaque sentinel, not a plain array
    expect(Array.isArray(payload.change_log)).toBe(false)
    const entry = payload.change_log.elements[payload.change_log.elements.length - 1]
    expect(entry).toMatchObject({ by: 'u9', field: 'review_acknowledged' })
  })
})
