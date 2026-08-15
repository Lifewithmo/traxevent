import { describe, it, expect, vi, beforeEach } from 'vitest'

const listAllVendors = vi.fn()
const listComplianceDocs = vi.fn()
const listFormTemplates = vi.fn()
const listWorkPackages = vi.fn()
const assertOrgMember = vi.fn()

vi.mock('@/actions/vendors', () => ({ listAllVendors: (...a: unknown[]) => listAllVendors(...a) }))
vi.mock('@/actions/compliance', () => ({ listComplianceDocs: (...a: unknown[]) => listComplianceDocs(...a) }))
vi.mock('@/actions/forms', () => ({ listFormTemplates: (...a: unknown[]) => listFormTemplates(...a) }))
vi.mock('@/actions/work-packages', () => ({ listWorkPackages: (...a: unknown[]) => listWorkPackages(...a) }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: (...a: unknown[]) => assertOrgMember(...a) }))

import { getCatalogOverview } from '@/actions/catalog-overview'

describe('getCatalogOverview', () => {
  beforeEach(() => {
    listAllVendors.mockReset().mockResolvedValue([])
    listComplianceDocs.mockReset().mockResolvedValue([])
    listFormTemplates.mockReset().mockResolvedValue([])
    listWorkPackages.mockReset().mockResolvedValue([])
    assertOrgMember.mockReset().mockResolvedValue(undefined)
  })

  it('asserts org membership before reading', async () => {
    await getCatalogOverview('org1')
    expect(assertOrgMember).toHaveBeenCalledWith('org1')
  })

  it('counts vendors and forms', async () => {
    listAllVendors.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }])
    listFormTemplates.mockResolvedValue([{ id: 'f1' }])
    const o = await getCatalogOverview('org1')
    expect(o.vendorCount).toBe(2)
    expect(o.formCount).toBe(1)
  })

  it('surfaces expiring compliance docs', async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    listComplianceDocs.mockResolvedValue([{ id: 'd1', name: 'Liability insurance', expires_on: soon, created_at: '2026-01-01' }])
    const o = await getCatalogOverview('org1')
    expect(o.expiring.map((d) => d.id)).toEqual(['d1'])
  })

  it('counts all compliance docs and packages, distinct from the expiring subset', async () => {
    const farOut = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10)
    listComplianceDocs.mockResolvedValue([
      { id: 'd1', name: 'W-9', expires_on: farOut, created_at: '2026-01-01' },
      { id: 'd2', name: 'COI', expires_on: farOut, created_at: '2026-01-01' },
    ])
    listWorkPackages.mockResolvedValue([{ id: 'p1' }])
    const o = await getCatalogOverview('org1')
    expect(o.complianceCount).toBe(2)
    expect(o.packageCount).toBe(1)
    expect(o.expiring).toEqual([])
  })
})
