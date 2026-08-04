'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertOrgMember, assertOrgAdmin, assertEventPage } from '@/lib/auth/assert'
import { validateEventPages } from '@/lib/tokens'
import { getBuiltInPermissionTemplates, BUILT_IN_TEMPLATE_IDS } from '@/lib/permission-templates'
import type { PermissionTemplate, EventPerson, EventPersonKind, EventPage } from '@/lib/types'
import { randomBytes } from 'crypto'

function templatesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('permission_templates')
}

function peopleRef(orgId: string, eventId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events').doc(eventId).collection('event_people')
}

function isBuiltIn(templateId: string): boolean {
  return (BUILT_IN_TEMPLATE_IDS as readonly string[]).includes(templateId)
}

export interface CreatePermissionTemplateInput {
  name: string
  description?: string
  pages: EventPage[]
}

export async function listPermissionTemplates(orgId: string): Promise<PermissionTemplate[]> {
  await assertOrgMember(orgId)
  const snap = await templatesRef(orgId).orderBy('created_at', 'desc').get()
  const custom = snap.docs.map((d) => d.data() as PermissionTemplate)
  return [...getBuiltInPermissionTemplates(), ...custom]
}

export async function createPermissionTemplate(
  orgId: string,
  input: CreatePermissionTemplateInput
): Promise<PermissionTemplate> {
  await assertOrgAdmin(orgId)
  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()
  const template: PermissionTemplate = {
    id,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    pages: validateEventPages(input.pages),
    is_built_in: false,
    created_at: now,
  }
  await templatesRef(orgId).doc(id).set(template)
  return template
}

export async function updatePermissionTemplate(
  orgId: string,
  templateId: string,
  updates: Partial<Pick<PermissionTemplate, 'name' | 'description' | 'pages'>>
): Promise<void> {
  await assertOrgAdmin(orgId)
  if (isBuiltIn(templateId)) throw new Error('Cannot modify a built-in template')
  const patch: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }
  if (updates.pages) patch.pages = validateEventPages(updates.pages)
  await templatesRef(orgId).doc(templateId).update(patch)
}

export async function deletePermissionTemplate(orgId: string, templateId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  if (isBuiltIn(templateId)) throw new Error('Cannot delete a built-in template')
  await templatesRef(orgId).doc(templateId).delete()
}

export async function listEventPeople(orgId: string, eventId: string): Promise<EventPerson[]> {
  await assertEventPage(orgId, eventId, 'people')
  const snap = await peopleRef(orgId, eventId).orderBy('created_at', 'asc').get()
  return snap.docs.map((d) => d.data() as EventPerson)
}

export interface AddEventPersonInput {
  kind: EventPersonKind
  name: string
  email: string
  role: string
  pages: EventPage[]
  appliedTemplateId?: string
}

export async function addEventPerson(
  orgId: string,
  eventId: string,
  input: AddEventPersonInput
): Promise<EventPerson> {
  await assertEventPage(orgId, eventId, 'people')
  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()
  const person: EventPerson = {
    id,
    kind: input.kind,
    name: input.name,
    email: input.email,
    role: input.role,
    pages: validateEventPages(input.pages),
    ...(input.appliedTemplateId ? { applied_template_id: input.appliedTemplateId } : {}),
    created_at: now,
  }
  await peopleRef(orgId, eventId).doc(id).set(person)
  return person
}

export async function updateEventPersonPermissions(
  orgId: string,
  eventId: string,
  personId: string,
  pages: EventPage[],
  appliedTemplateId?: string
): Promise<void> {
  await assertEventPage(orgId, eventId, 'people')
  await peopleRef(orgId, eventId).doc(personId).update({
    pages: validateEventPages(pages),
    applied_template_id: appliedTemplateId ?? null,
    updated_at: new Date().toISOString(),
  })
}

export async function removeEventPerson(
  orgId: string,
  eventId: string,
  personId: string
): Promise<void> {
  await assertEventPage(orgId, eventId, 'people')
  await peopleRef(orgId, eventId).doc(personId).delete()
}
