'use server'

import { assertOrgMember } from '@/lib/auth/assert'
import { listAllInvoices } from '@/actions/invoices'
import { buildMoneyOverview } from '@/lib/money-overview'
import type { MoneyOverview } from '@/lib/money-overview'

export async function getMoneyOverview(orgId: string): Promise<MoneyOverview> {
  await assertOrgMember(orgId)
  return buildMoneyOverview(await listAllInvoices(orgId), new Date())
}
