import type { FormField } from '@/lib/types'

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
