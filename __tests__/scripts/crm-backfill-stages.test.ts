import { describe, it, expect, vi, beforeEach } from 'vitest'
const listLeadsCore = vi.hoisted(() => vi.fn())
const updateLeadCore = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/lib/crm/leads', () => ({
  listLeadsCore: (...a: unknown[]) => listLeadsCore(...a),
  updateLeadCore: (...a: unknown[]) => updateLeadCore(...a),
}))
import { mapLegacyStage, backfillStages } from '@/scripts/crm-backfill-stages'

describe('mapLegacyStage', () => {
  it('booked → closed_won', () => expect(mapLegacyStage('booked')).toBe('closed_won'))
  it('delivered → closed_won', () => expect(mapLegacyStage('delivered')).toBe('closed_won'))
  it('current V1 stages are unchanged (null)', () => {
    for (const s of ['inquiry', 'consultation', 'proposal', 'closed_won', 'closed_lost']) {
      expect(mapLegacyStage(s)).toBeNull()
    }
  })
})

describe('backfillStages', () => {
  beforeEach(() => vi.clearAllMocks())
  it('dry-run reports changes but writes nothing', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', stage: 'booked' }, { id: 'l2', stage: 'inquiry' }])
    const s = await backfillStages('o1', { dryRun: true })
    expect(updateLeadCore).not.toHaveBeenCalled()
    expect(s).toMatchObject({ totalLeads: 2, rewritten: 1, unchanged: 1 })
    expect(s.changes).toEqual([{ id: 'l1', from: 'booked', to: 'closed_won' }])
  })
  it('rewrites legacy leads to closed_won', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', stage: 'delivered' }])
    await backfillStages('o1')
    expect(updateLeadCore).toHaveBeenCalledWith('o1', 'l1', { stage: 'closed_won' })
  })
  it('is idempotent on already-migrated data', async () => {
    listLeadsCore.mockResolvedValue([{ id: 'l1', stage: 'closed_won' }, { id: 'l2', stage: 'proposal' }])
    const s = await backfillStages('o1')
    expect(updateLeadCore).not.toHaveBeenCalled()
    expect(s.rewritten).toBe(0)
  })
})
