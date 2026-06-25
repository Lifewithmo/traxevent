'use server'

import { adminDb } from '@/lib/firebase-admin'
import { getAllEventTypes } from '@/lib/event-types'
import type { EventType, RegistrationUnit, Terminology } from '@/lib/event-types'
import { randomBytes } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'

function typesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('event_types')
}

function isBuiltInId(id: string): boolean {
  return getAllEventTypes().some((t) => t.id === id)
}

export async function listOrgEventTypes(orgId: string): Promise<EventType[]> {
  await assertOrgMember(orgId)
  const snap = await typesRef(orgId).orderBy('created_at', 'desc').get()
  const custom = snap.docs.map((d) => d.data() as EventType)
  return [...getAllEventTypes(), ...custom]
}

export interface CreateCustomEventTypeInput {
  name: string
  description: string
  registrationUnit: RegistrationUnit
  terminology: Terminology
}

export async function createCustomEventType(
  orgId: string,
  input: CreateCustomEventTypeInput
): Promise<EventType> {
  await assertOrgAdmin(orgId)
  const id = `custom-${randomBytes(8).toString('hex')}`
  const type: EventType & { created_at: string } = {
    id,
    name: input.name,
    description: input.description,
    registrationUnit: input.registrationUnit,
    terminology: input.terminology,
    is_custom: true,
    created_at: new Date().toISOString(),
  }
  await typesRef(orgId).doc(id).set(type)
  return type
}

export async function deleteCustomEventType(orgId: string, typeId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  if (isBuiltInId(typeId)) throw new Error('Cannot delete a built-in event type')
  await typesRef(orgId).doc(typeId).delete()
}
