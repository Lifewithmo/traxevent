'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { assertNetworkAdmin } from '@/lib/auth/assert'
import { randomBytes } from 'crypto'
import type { FormTemplate, FormType, FormAudience, FormField } from '@/lib/types'

function netTemplatesRef(networkId: string) {
  return adminDb.collection('networks').doc(networkId).collection('form_templates')
}

export async function listNetworkFormTemplates(networkId: string): Promise<FormTemplate[]> {
  await assertNetworkAdmin(networkId)
  const snap = await netTemplatesRef(networkId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as FormTemplate)
}

export interface CreateNetworkFormTemplateInput {
  name: string
  formType: FormType
  audience: FormAudience
  fields: FormField[]
}

export async function createNetworkFormTemplate(
  networkId: string,
  input: CreateNetworkFormTemplateInput
): Promise<FormTemplate> {
  await assertNetworkAdmin(networkId)
  const id = randomBytes(8).toString('hex')
  const template: FormTemplate = {
    id,
    name: input.name,
    form_type: input.formType,
    audience: input.audience,
    fields: input.fields,
    version: 1,
    created_at: new Date().toISOString(),
  }
  await netTemplatesRef(networkId).doc(id).set(template)
  return template
}

export async function updateNetworkFormTemplate(
  networkId: string,
  templateId: string,
  updates: Partial<Pick<FormTemplate, 'name' | 'form_type' | 'audience' | 'fields'>>
): Promise<void> {
  await assertNetworkAdmin(networkId)
  await netTemplatesRef(networkId).doc(templateId).update({
    ...updates,
    version: FieldValue.increment(1),
    updated_at: new Date().toISOString(),
  })
}

export async function deleteNetworkFormTemplate(networkId: string, templateId: string): Promise<void> {
  await assertNetworkAdmin(networkId)
  await netTemplatesRef(networkId).doc(templateId).delete()
}
