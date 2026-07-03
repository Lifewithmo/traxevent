'use server'

import { adminDb } from '@/lib/firebase-admin'
import type { Contract, ContractStatus } from '@/lib/types'

// Public-safe projection of a Contract. OMITS the secret `token`, internal
// `org_id`, `lead_id`, and `id`.
export interface PublicContract {
  title?: string
  body?: string
  document_url?: string
  status: ContractStatus
  signed_by?: string
  signed_at?: string
  created_at: string
}

async function findContractByToken(token: string) {
  const snap = await adminDb.collectionGroup('contracts').where('token', '==', token).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]
}

// PUBLIC (token = authorization). Drafts are never exposed.
export async function getPublicContract(token: string): Promise<PublicContract | null> {
  const doc = await findContractByToken(token)
  if (!doc) return null
  const contract = doc.data() as Contract
  if (contract.status === 'draft') return null
  const publicContract: PublicContract = {
    status: contract.status,
    created_at: contract.created_at,
  }
  if (contract.title !== undefined) publicContract.title = contract.title
  if (contract.body !== undefined) publicContract.body = contract.body
  if (contract.document_url !== undefined) publicContract.document_url = contract.document_url
  if (contract.signed_by !== undefined) publicContract.signed_by = contract.signed_by
  if (contract.signed_at !== undefined) publicContract.signed_at = contract.signed_at
  return publicContract
}

// PUBLIC. Client e-signs by typing their name. Only a `sent` contract can be signed.
export async function signContract(token: string, signerName: string): Promise<void> {
  const name = signerName?.trim()
  if (!name) throw new Error('Please type your name to sign')
  const doc = await findContractByToken(token)
  if (!doc) throw new Error('Contract not found')
  const contract = doc.data() as Contract
  if (contract.status !== 'sent') throw new Error('This contract is no longer awaiting a signature')
  const now = new Date().toISOString()
  await doc.ref.update({ status: 'signed', signed_by: name, signed_at: now, updated_at: now })
}
