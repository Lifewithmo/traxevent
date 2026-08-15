import { describe, it, expect, vi, beforeEach } from 'vitest'

const assertOrgMemberSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'staff' }))
const assertOrgAdminSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'admin' }))
const cores = vi.hoisted(() => ({
  createSeriesCore: vi.fn().mockResolvedValue({ series: { id: 's1' }, created: 3 }),
  getSeriesCore: vi.fn().mockResolvedValue({ id: 's1' }),
  listSeriesCore: vi.fn().mockResolvedValue([]),
  listSeriesDaysCore: vi.fn().mockResolvedValue([]),
  updateSeriesCore: vi.fn().mockResolvedValue(undefined),
  extendSeriesCore: vi.fn().mockResolvedValue({ created: 2 }),
  endSeriesCore: vi.fn().mockResolvedValue({ archived: 1 }),
}))

vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: assertOrgMemberSpy, assertOrgAdmin: assertOrgAdminSpy }))
vi.mock('@/lib/occasions/series', () => cores)

import { createSeries, listSeries, updateSeries, endSeries } from '@/actions/series'

describe('series actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads gate on membership, writes on admin', async () => {
    await listSeries('org-1')
    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')
    await createSeries('org-1', {} as never)
    await updateSeries('org-1', 's1', {})
    await endSeries('org-1', 's1')
    expect(assertOrgAdminSpy).toHaveBeenCalledTimes(3)
  })

  it('passes propagate options through', async () => {
    await updateSeries('org-1', 's1', { booth_fee: 55 }, { propagate: true })
    expect(cores.updateSeriesCore).toHaveBeenCalledWith('org-1', 's1', { booth_fee: 55 }, { propagate: true })
  })
})
