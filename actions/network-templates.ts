'use server'

import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { assertNetworkAdmin } from '@/lib/auth/assert'
import { listNetworkOrgs } from '@/actions/networks'
import { randomBytes } from 'crypto'
import type { FormTemplate, FormType, FormAudience, FormField, Org } from '@/lib/types'

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

// Push a network template into every member org's form_templates. Idempotent: re-pushing
// updates the existing copy (matched by network_template_id) rather than duplicating it.
export async function pushFormTemplateToNetworkOrgs(
  networkId: string,
  networkTemplateId: string
): Promise<{ pushed: number }> {
  await assertNetworkAdmin(networkId)
  const tmplSnap = await netTemplatesRef(networkId).doc(networkTemplateId).get()
  if (!tmplSnap.exists) throw new Error('Template not found')
  const t = tmplSnap.data() as FormTemplate

  const orgs: Org[] = await listNetworkOrgs(networkId)
  const now = new Date().toISOString()

  let pushed = 0
  for (const org of orgs) {
    const orgTemplates = adminDb.collection('orgs').doc(org.id).collection('form_templates')
    const existing = await orgTemplates
      .where('network_template_id', '==', networkTemplateId)
      .limit(1)
      .get()
    if (existing.empty) {
      const localId = randomBytes(8).toString('hex')
      await orgTemplates.doc(localId).set({
        id: localId,
        name: t.name,
        form_type: t.form_type,
        audience: t.audience,
        fields: t.fields,
        version: 1,
        created_at: now,
        network_template_id: networkTemplateId,
        network_id: networkId,
        pushed_at: now,
      } satisfies FormTemplate)
    } else {
      await orgTemplates.doc(existing.docs[0].id).update({
        name: t.name,
        form_type: t.form_type,
        audience: t.audience,
        fields: t.fields,
        version: FieldValue.increment(1),
        updated_at: now,
        pushed_at: now,
      })
    }
    pushed++
  }
  return { pushed }
}
