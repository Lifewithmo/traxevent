import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedInvoice } from '@/lib/types'

const listAllInvoices = vi.fn()
const assertOrgMember = vi.fn()

vi.mock('@/actions/invoices', () => ({ listAllInvoices: (...a: unknown[]) => listAllInvoices(...a) }))
vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: (...a: unknown[]) => assertOrgMember(...a) }))

import { getMoneyOverview } from '@/actions/money-overview'

describe('getMoneyOverview', () => {
  beforeEach(() => {
    listAllInvoices.mockReset().mockResolvedValue([])
    assertOrgMember.mockReset().mockResolvedValue(undefined)
  })

  it('asserts org membership before reading', async () => {
    await getMoneyOverview('org1')
    expect(assertOrgMember).toHaveBeenCalledWith('org1')
  })

  it('returns a rollup of the org invoices', async () => {
    listAllInvoices.mockResolvedValue([
      { id: 'a', lifecycle: 'sent', line_items: [{ description: 'x', quantity: 1, unit_price: 250 }], payments: [] },
    ] as unknown as NormalizedInvoice[])
    const o = await getMoneyOverview('org1')
    expect(o.outstanding).toBe(250)
  })
})
