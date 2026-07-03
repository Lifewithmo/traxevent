'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { VENDOR_STATUSES } from '@/lib/vendors'
import type { Vendor, VendorStatus } from '@/lib/types'

function vendorsRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('vendors')
}

export interface CreateVendorInput {
  name: string
  service?: string
  contact_name?: string
  email?: string
  phone?: string
  cost?: number
  status?: VendorStatus
  notes?: string
}

export async function listVendors(orgId: string, leadId: string): Promise<Vendor[]> {
  await assertOrgMember(orgId)
  const snap = await vendorsRef(orgId).where('lead_id', '==', leadId).orderBy('created_at', 'asc').get()
  return snap.docs.map((d) => d.data() as Vendor)
}

export async function createVendor(orgId: string, leadId: string, input: CreateVendorInput): Promise<Vendor> {
  await assertOrgAdmin(orgId)
  if (!input.name?.trim()) throw new Error('Name is required')
  const status = input.status ?? 'potential'
  if (!VENDOR_STATUSES.includes(status)) throw new Error('Invalid status')
  const id = randomBytes(8).toString('hex')
  const vendor: Vendor = {
    id,
    lead_id: leadId,
    name: input.name.trim(),
    status,
    created_at: new Date().toISOString(),
    ...(input.service?.trim() ? { service: input.service.trim() } : {}),
    ...(input.contact_name?.trim() ? { contact_name: input.contact_name.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.cost != null ? { cost: input.cost } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await vendorsRef(orgId).doc(id).set(vendor)
  return vendor
}

export interface VendorUpdate {
  name?: string
  service?: string | null
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  cost?: number | null
  status?: VendorStatus
  notes?: string | null
}

export async function updateVendor(orgId: string, vendorId: string, updates: VendorUpdate): Promise<void> {
  await assertOrgAdmin(orgId)
  if (updates.status && !VENDOR_STATUSES.includes(updates.status)) throw new Error('Invalid status')
  const cleaned: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(updates)) {
    if (val === undefined) continue
    cleaned[k] = val === null ? FieldValue.delete() : val
  }
  await vendorsRef(orgId).doc(vendorId).update({ ...cleaned, updated_at: new Date().toISOString() })
}

export async function deleteVendor(orgId: string, vendorId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await vendorsRef(orgId).doc(vendorId).delete()
}
