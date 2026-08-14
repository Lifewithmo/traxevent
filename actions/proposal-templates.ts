'use server'

import { randomBytes } from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { normalizeProposalDraft, type ProposalDraftInput, type ProposalDraftUpdate } from '@/lib/proposals/draft'
import { TEMPLATE_CONTENT_FIELDS, type TemplateContent } from '@/lib/proposals/templates'
import type { ProposalTemplate } from '@/lib/types'

// NOTE: 'use server' module — async function exports only, no type re-exports.

function templatesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('proposal_templates')
}

export async function listProposalTemplates(orgId: string): Promise<ProposalTemplate[]> {
  await assertOrgMember(orgId)
  const snap = await templatesRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as ProposalTemplate)
}

export async function getProposalTemplate(orgId: string, templateId: string): Promise<ProposalTemplate | null> {
  await assertOrgMember(orgId)
  const snap = await templatesRef(orgId).doc(templateId).get()
  return snap.exists ? (snap.data() as ProposalTemplate) : null
}

export async function createProposalTemplate(
  orgId: string,
  input: { name: string; description?: string; content?: TemplateContent }
): Promise<ProposalTemplate> {
  await assertOrgAdmin(orgId)
  const name = input.name?.trim()
  if (!name) throw new Error('A template name is required')
  const id = randomBytes(8).toString('hex')
  const content: Record<string, unknown> = {}
  for (const key of TEMPLATE_CONTENT_FIELDS) {
    const v = input.content?.[key]
    if (v !== undefined) content[key] = v
  }
  const template: ProposalTemplate = {
    id,
    org_id: orgId,
    name,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    line_items: [],
    ...content,
    created_at: new Date().toISOString(),
  }
  await templatesRef(orgId).doc(id).set(template)
  return template
}

export async function renameProposalTemplate(orgId: string, templateId: string, name: string): Promise<void> {
  await assertOrgAdmin(orgId)
  const trimmed = name?.trim()
  if (!trimmed) throw new Error('A template name is required')
  await templatesRef(orgId).doc(templateId).update({ name: trimmed, updated_at: new Date().toISOString() })
}

export async function duplicateProposalTemplate(orgId: string, templateId: string): Promise<ProposalTemplate> {
  await assertOrgAdmin(orgId)
  const snap = await templatesRef(orgId).doc(templateId).get()
  if (!snap.exists) throw new Error('Template not found')
  const source = snap.data() as ProposalTemplate
  const id = randomBytes(8).toString('hex')
  // usage_count deliberately not copied: the copy has never been used.
  const { usage_count: _unusedCount, updated_at: _unusedStamp, ...rest } = source
  const copy: ProposalTemplate = {
    ...rest,
    id,
    name: `${source.name} (copy)`,
    created_at: new Date().toISOString(),
  }
  await templatesRef(orgId).doc(id).set(copy)
  return copy
}

export async function deleteProposalTemplate(orgId: string, templateId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await templatesRef(orgId).doc(templateId).delete()
}

/**
 * Full-state draft write for the template editor — the template counterpart
 * of updateProposalDraft. Same normalizeProposalDraft semantics; absent
 * content key = cleared. expires_at is never persisted: expiry is a
 * per-proposal decision, not template content.
 */
export async function updateTemplateDraft(
  orgId: string,
  templateId: string,
  input: ProposalDraftInput
): Promise<{ persisted: ProposalDraftUpdate; adjustments: string[] }> {
  await assertOrgAdmin(orgId)
  const ref = templatesRef(orgId).doc(templateId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Template not found')

  const { draft, adjustments } = normalizeProposalDraft(input)
  const updated_at = new Date().toISOString()

  const update: Record<string, unknown> = {
    blocks: draft.blocks,
    line_items: draft.line_items,
    updated_at,
  }
  const persisted: ProposalDraftUpdate = { blocks: draft.blocks, line_items: draft.line_items }
  for (const key of TEMPLATE_CONTENT_FIELDS) {
    if (key === 'blocks' || key === 'line_items') continue
    const v = draft[key]
    if (v === undefined) {
      update[key] = FieldValue.delete()
    } else {
      update[key] = v
      ;(persisted as Record<string, unknown>)[key] = v
    }
  }
  await ref.update(update)
  return { persisted, adjustments }
}
