'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { CONTRACT_STATUSES } from '@/lib/contracts'
import type { Contract, ContractStatus } from '@/lib/types'

function contractsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('contracts')
}

function assertValidDocumentUrl(url: string | undefined) {
  if (url && !/^https?:\/\//.test(url)) throw new Error('Document URL must start with http:// or https://')
}

export interface CreateContractInput {
  title?: string
  body?: string
  document_url?: string
}

export async function listContracts(orgId: string, leadId: string): Promise<Contract[]> {
  await assertOrgMember(orgId)
  const snap = await contractsRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Contract)
}

export async function listAllContracts(orgId: string): Promise<Contract[]> {
  await assertOrgMember(orgId)
  const snap = await contractsRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as Contract)
}

export async function getContract(orgId: string, contractId: string): Promise<Contract | null> {
  await assertOrgMember(orgId)
  const snap = await contractsRef(orgId).doc(contractId).get()
  return snap.exists ? (snap.data() as Contract) : null
}

export async function createContract(orgId: string, leadId: string, input: CreateContractInput): Promise<Contract> {
  await assertOrgAdmin(orgId)
  assertValidDocumentUrl(input.document_url?.trim())
  const id = randomBytes(8).toString('hex')
  const contract: Contract = {
    id,
    org_id: orgId,
    lead_id: leadId,
    token: generateAccessToken(),
    status: 'draft',
    created_at: new Date().toISOString(),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.body?.trim() ? { body: input.body.trim() } : {}),
    ...(input.document_url?.trim() ? { document_url: input.document_url.trim() } : {}),
  }
  await contractsRef(orgId).doc(id).set(contract)
  return contract
}

export interface ContractUpdate {
  title?: string
  body?: string
  document_url?: string
  status?: ContractStatus
}

export async function updateContract(orgId: string, contractId: string, updates: ContractUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.status && !CONTRACT_STATUSES.includes(updates.status)) throw new Error('Invalid status')
  assertValidDocumentUrl(updates.document_url?.trim())
  await contractsRef(orgId).doc(contractId).update({ ...updates, updated_at: new Date().toISOString() })
}

export async function sendContract(orgId: string, contractId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await contractsRef(orgId).doc(contractId).update({ status: 'sent', updated_at: new Date().toISOString() })
}

export async function deleteContract(orgId: string, contractId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await contractsRef(orgId).doc(contractId).delete()
}
