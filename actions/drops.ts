'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  listDropsCore, getDropCore, createDropCore, updateDraftDropCore,
  closeDropCore, archiveDropCore, adjustStockCore,
  type CreateDropInput,
} from '@/lib/storefront/drops'
import type { Drop } from '@/lib/types'

export async function listDrops(orgId: string): Promise<Drop[]> {
  await assertOrgMember(orgId)
  return listDropsCore(orgId)
}

export async function getDrop(orgId: string, dropId: string): Promise<Drop | null> {
  await assertOrgMember(orgId)
  return getDropCore(orgId, dropId)
}

export async function createDrop(orgId: string, input: CreateDropInput): Promise<Drop> {
  await assertOrgAdmin(orgId)
  return createDropCore(orgId, input)
}

export async function updateDraftDrop(orgId: string, dropId: string, input: CreateDropInput): Promise<Drop> {
  await assertOrgAdmin(orgId)
  return updateDraftDropCore(orgId, dropId, input)
}

export async function closeDrop(orgId: string, dropId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return closeDropCore(orgId, dropId)
}

export async function archiveDrop(orgId: string, dropId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  return archiveDropCore(orgId, dropId)
}

export async function adjustDropStock(orgId: string, dropId: string, productId: string, stock: number | null): Promise<void> {
  await assertOrgAdmin(orgId)
  return adjustStockCore(orgId, dropId, productId, stock)
}
