import { adminDb } from '@/lib/firebase-admin'
import type { ChecklistTemplate, ChecklistPhase, ChecklistTemplateStep, EvidenceType } from '@/lib/types'

const PHASES: ChecklistPhase[] = ['prep', 'load-out', 'setup', 'service-close', 'closeout']
const EVIDENCE_TYPES: EvidenceType[] = ['none', 'photo', 'number']

export interface CreateChecklistTemplateInput {
  name: string
  phase: ChecklistPhase
  steps: ChecklistTemplateStep[]
}

export function checklistTemplatesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('checklist_templates')
}

export async function listChecklistTemplatesCore(orgId: string): Promise<ChecklistTemplate[]> {
  const snap = await checklistTemplatesRef(orgId).orderBy('name').get()
  return snap.docs.map((d) => d.data() as ChecklistTemplate)
}

export async function createChecklistTemplateCore(
  orgId: string,
  input: CreateChecklistTemplateInput,
): Promise<ChecklistTemplate> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!PHASES.includes(input.phase)) throw new Error('Invalid phase')
  if (!input.steps?.length) throw new Error('At least one step is required')
  for (const step of input.steps) {
    if (!step.text?.trim()) throw new Error('Step text is required')
    if (!EVIDENCE_TYPES.includes(step.evidence)) throw new Error('Invalid evidence type')
  }
  const ref = checklistTemplatesRef(orgId).doc()
  const template: ChecklistTemplate = {
    id: ref.id,
    name: input.name.trim(),
    phase: input.phase,
    steps: input.steps,
    created_at: new Date().toISOString(),
  }
  await ref.set(template)
  return template
}

export async function deleteChecklistTemplateCore(orgId: string, templateId: string): Promise<void> {
  await checklistTemplatesRef(orgId).doc(templateId).delete()
}

// Built-in defaults, keyed by industry pack id. Universal nouns only — the UI
// applies pack terminology. ids are stable strings so instantiated checklists
// can be traced back to their source template.
function t(id: string, name: string, phase: ChecklistPhase, steps: [string, EvidenceType?][]): ChecklistTemplate {
  return {
    id, name, phase,
    steps: steps.map(([text, evidence]) => ({ text, evidence: evidence ?? 'none' })),
    created_at: '2026-08-05T00:00:00.000Z',
  }
}

export const BUILT_IN_TEMPLATES: Record<string, ChecklistTemplate[]> = {
  'coffee-cart': [
    t('bi-cc-prep', 'Prep', 'prep', [
      ['Confirm final guest count with client'],
      ['Verify all consumables purchased against shopping list'],
      ['Test equipment: machine, grinder', 'photo'],
      ['Batch/stage ingredients and label'],
    ]),
    t('bi-cc-loadout', 'Load-out', 'load-out', [
      ['Pack all items on packing list'],
      ['Load vehicle; verify nothing left behind', 'photo'],
      ['Confirm venue address, arrival window, and site contact'],
    ]),
    t('bi-cc-setup', 'Setup', 'setup', [
      ['Site check: power, water, level ground'],
      ['Assemble station and test equipment on site'],
      ['Station photo before service', 'photo'],
    ]),
    t('bi-cc-service', 'Service close', 'service-close', [
      ['Record drinks served (approx.)', 'number'],
      ['Note any issues during service'],
    ]),
    t('bi-cc-closeout', 'Closeout', 'closeout', [
      ['Record leftover consumable quantities', 'number'],
      ['Clean and pack equipment'],
      ['Site condition photo on departure', 'photo'],
      ['Record hours worked', 'number'],
    ]),
  ],
  general: [
    t('bi-gen-prep', 'Prep', 'prep', [
      ['Confirm requirements with client'],
      ['Verify all materials ready'],
    ]),
    t('bi-gen-setup', 'Setup', 'setup', [
      ['Arrive and verify site access'],
      ['Complete setup; photo before start', 'photo'],
    ]),
    t('bi-gen-closeout', 'Closeout', 'closeout', [
      ['Confirm teardown complete'],
      ['Record hours worked', 'number'],
    ]),
  ],
}

/**
 * Built-ins for the pack, merged with the org's own templates: an org
 * template whose id matches a built-in OVERRIDES that built-in; an org
 * template with a new id is APPENDED. This lets an org customize e.g.
 * 'bi-cc-prep' while still inheriting the rest of the pack's built-ins, and
 * still keeps built-in ids attachable via WorkPackage.checklist_template_ids.
 */
export async function getTemplatesForOrg(
  orgId: string,
  industryPackId: string | undefined,
): Promise<ChecklistTemplate[]> {
  const own = await listChecklistTemplatesCore(orgId)
  const builtIns = BUILT_IN_TEMPLATES[industryPackId ?? 'general'] ?? BUILT_IN_TEMPLATES['general']
  if (own.length === 0) return builtIns
  const ownById = new Map(own.map((t) => [t.id, t]))
  const merged = builtIns.map((t) => ownById.get(t.id) ?? t)
  const mergedIds = new Set(merged.map((t) => t.id))
  for (const t of own) {
    if (!mergedIds.has(t.id)) merged.push(t)
  }
  return merged
}
