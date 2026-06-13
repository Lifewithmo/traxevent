import type { FormField, EventFormAssignment, FormAudience } from '@/lib/types'

type ResponseValue = string | boolean | string[]
type Responses = Record<string, ResponseValue>

function isEmpty(v: ResponseValue | undefined): boolean {
  if (v == null) return true
  if (v === '') return true
  if (Array.isArray(v)) return v.length === 0
  return false
}

// Whether a field should be shown given the current responses. Fields without a
// condition are always visible. Evaluated against the raw responses map.
export function isFieldVisible(field: FormField, responses: Responses): boolean {
  const c = field.condition
  if (!c) return true
  const v = responses[c.dependsOn]
  switch (c.operator) {
    case 'equals':
      return String(v ?? '') === c.value
    case 'not_equals':
      return String(v ?? '') !== c.value
    case 'is_checked':
      return v === true
    case 'is_not_empty':
      return !isEmpty(v)
    default:
      return true
  }
}

// The subset of fields currently visible, in original order.
export function getVisibleFields(fields: FormField[], responses: Responses): FormField[] {
  return fields.filter((f) => isFieldVisible(f, responses))
}

export interface FormCompletionFamily {
  family_id: string
  name: string
  email: string
}

export interface FormCompletionRow {
  assignment_id: string
  template_name: string
  audience: FormAudience
  total: number
  submitted_count: number
  missing: FormCompletionFamily[]
}

// Per required, registrant-audience assignment: how many active families have
// signed, and which are still missing. `signedKeys` holds `${familyId}:${assignmentId}`.
export function summarizeFormCompletion(
  families: FormCompletionFamily[],
  assignments: EventFormAssignment[],
  signedKeys: Set<string>
): FormCompletionRow[] {
  return assignments
    .filter((a) => a.required && a.audience === 'registrant')
    .map((a) => {
      const missing = families.filter((f) => !signedKeys.has(`${f.family_id}:${a.id}`))
      return {
        assignment_id: a.id,
        template_name: a.template_name,
        audience: a.audience,
        total: families.length,
        submitted_count: families.length - missing.length,
        missing,
      }
    })
}
