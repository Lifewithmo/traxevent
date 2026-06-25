'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertOrgMember, assertOrgAdmin, assertCampPage } from '@/lib/auth/assert'
import { assertFamilyAccess } from '@/lib/auth/family-access'
import { FieldValue } from 'firebase-admin/firestore'
import { headers } from 'next/headers'
import { sendFormSignedConfirmation } from '@/lib/email'
import { getVerifiedSendingDomain } from '@/actions/domains'
import type { FormTemplate, EventFormAssignment, SignedForm } from '@/lib/types'
import { randomBytes } from 'crypto'

function templatesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('form_templates')
}

function assignmentsRef(orgId: string, campId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('form_assignments')
}

function signedFormsRef(orgId: string, campId: string, familyId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('camps').doc(campId).collection('families').doc(familyId).collection('signed_forms')
}

export interface CreateFormTemplateInput {
  name: string
  formType: FormTemplate['form_type']
  audience: FormTemplate['audience']
  fields: FormTemplate['fields']
}

export async function listFormTemplates(orgId: string): Promise<FormTemplate[]> {
  await assertOrgMember(orgId)
  const snap = await templatesRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as FormTemplate)
}

export async function createFormTemplate(
  orgId: string,
  input: CreateFormTemplateInput
): Promise<FormTemplate> {
  await assertOrgAdmin(orgId)
  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()
  const template: FormTemplate = {
    id,
    name: input.name,
    form_type: input.formType,
    audience: input.audience,
    fields: input.fields,
    version: 1,
    created_at: now,
  }
  await templatesRef(orgId).doc(id).set(template)
  return template
}

export async function updateFormTemplate(
  orgId: string,
  templateId: string,
  updates: Partial<Pick<FormTemplate, 'name' | 'form_type' | 'audience' | 'fields'>>
): Promise<void> {
  await assertOrgAdmin(orgId)
  await templatesRef(orgId).doc(templateId).update({
    ...updates,
    version: FieldValue.increment(1),
    updated_at: new Date().toISOString(),
  })
}

export async function deleteFormTemplate(orgId: string, templateId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await templatesRef(orgId).doc(templateId).delete()
}

export async function listEventFormAssignments(
  orgId: string,
  campId: string
): Promise<EventFormAssignment[]> {
  const snap = await assignmentsRef(orgId, campId).orderBy('created_at', 'asc').get()
  return snap.docs.map((d) => d.data() as EventFormAssignment)
}

export async function assignFormToEvent(
  orgId: string,
  campId: string,
  template: FormTemplate,
  required = true
): Promise<EventFormAssignment> {
  await assertCampPage(orgId, campId, 'forms')
  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()
  const assignment: EventFormAssignment = {
    id,
    template_id: template.id,
    template_name: template.name,
    template_version: template.version,
    fields_snapshot: template.fields,
    audience: template.audience,
    required,
    created_at: now,
  }
  await assignmentsRef(orgId, campId).doc(id).set(assignment)
  return assignment
}

export async function removeFormAssignment(
  orgId: string,
  campId: string,
  assignmentId: string
): Promise<void> {
  await assertCampPage(orgId, campId, 'forms')
  await assignmentsRef(orgId, campId).doc(assignmentId).delete()
}

export async function getSignedForms(
  orgId: string,
  campId: string,
  familyId: string,
  token?: string
): Promise<SignedForm[]> {
  await assertFamilyAccess(orgId, campId, familyId, { token, page: 'forms' })
  const snap = await signedFormsRef(orgId, campId, familyId).orderBy('signed_at', 'desc').get()
  return snap.docs.map((d) => d.data() as SignedForm)
}

export interface SubmitSignedFormInput {
  assignmentId: string
  templateId: string
  templateVersion: number
  templateName: string
  responses: Record<string, string | boolean | string[]>
  signatureName: string
  signerEmail: string
  signerFirstName: string
  campName: string
  orgName: string
  orgSlug: string
  campSlug: string
  fromDisplayName?: string
  replyTo?: string
}

export async function submitSignedForm(
  orgId: string,
  campId: string,
  familyId: string,
  input: SubmitSignedFormInput
): Promise<SignedForm> {
  const headersList = await headers()
  const signerIp =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'

  const id = randomBytes(8).toString('hex')
  const now = new Date().toISOString()

  const signed: SignedForm = {
    id,
    org_id: orgId,
    camp_id: campId,
    assignment_id: input.assignmentId,
    template_id: input.templateId,
    template_version: input.templateVersion,
    template_name: input.templateName,
    responses: input.responses,
    signature_name: input.signatureName,
    signer_ip: signerIp,
    signed_at: now,
    created_at: now,
  }

  await signedFormsRef(orgId, campId, familyId).doc(id).set(signed)

  const fromDomain = await getVerifiedSendingDomain(orgId)
  await sendFormSignedConfirmation({
    to: input.signerEmail,
    firstName: input.signerFirstName,
    formName: input.templateName,
    campName: input.campName,
    orgName: input.orgName,
    signedAt: now,
    fromDisplayName: input.fromDisplayName,
    replyTo: input.replyTo,
    fromDomain,
  })

  return signed
}
