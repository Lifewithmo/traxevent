import { describe, it, expect } from 'vitest'
import { isFieldVisible, getVisibleFields, summarizeFormCompletion } from '@/lib/forms'
import type { FormField, EventFormAssignment } from '@/lib/types'

function f(o: Partial<FormField>): FormField {
  return { id: 'x', type: 'text', label: 'X', required: false, ...o }
}

describe('isFieldVisible', () => {
  it('is visible when there is no condition', () => {
    expect(isFieldVisible(f({}), {})).toBe(true)
  })

  it('equals: visible only when the dependency matches', () => {
    const field = f({ id: 'b', condition: { dependsOn: 'a', operator: 'equals', value: 'Yes' } })
    expect(isFieldVisible(field, { a: 'Yes' })).toBe(true)
    expect(isFieldVisible(field, { a: 'No' })).toBe(false)
    expect(isFieldVisible(field, {})).toBe(false)
  })

  it('not_equals: visible unless the dependency matches', () => {
    const field = f({ id: 'b', condition: { dependsOn: 'a', operator: 'not_equals', value: 'Yes' } })
    expect(isFieldVisible(field, { a: 'No' })).toBe(true)
    expect(isFieldVisible(field, { a: 'Yes' })).toBe(false)
  })

  it('is_checked: visible only when the dependency is a checked checkbox', () => {
    const field = f({ id: 'b', condition: { dependsOn: 'a', operator: 'is_checked', value: '' } })
    expect(isFieldVisible(field, { a: true })).toBe(true)
    expect(isFieldVisible(field, { a: false })).toBe(false)
    expect(isFieldVisible(field, {})).toBe(false)
  })

  it('is_not_empty: visible when the dependency has any non-empty answer', () => {
    const field = f({ id: 'b', condition: { dependsOn: 'a', operator: 'is_not_empty', value: '' } })
    expect(isFieldVisible(field, { a: 'something' })).toBe(true)
    expect(isFieldVisible(field, { a: '' })).toBe(false)
    expect(isFieldVisible(field, { a: [] })).toBe(false)
    expect(isFieldVisible(field, {})).toBe(false)
  })
})

describe('getVisibleFields', () => {
  it('filters out fields whose condition is unmet', () => {
    const fields = [
      f({ id: 'a', type: 'radio', label: 'Has allergies?', options: ['Yes', 'No'] }),
      f({ id: 'b', label: 'Describe', condition: { dependsOn: 'a', operator: 'equals', value: 'Yes' } }),
    ]
    expect(getVisibleFields(fields, { a: 'No' }).map((x) => x.id)).toEqual(['a'])
    expect(getVisibleFields(fields, { a: 'Yes' }).map((x) => x.id)).toEqual(['a', 'b'])
  })
})

function assignment(o: Partial<EventFormAssignment>): EventFormAssignment {
  return {
    id: 'a1', template_id: 't1', template_name: 'Waiver', template_version: 1,
    fields_snapshot: [], audience: 'registrant', required: true, created_at: 'x', ...o,
  }
}

describe('summarizeFormCompletion', () => {
  const fams = [
    { family_id: 'f1', name: 'Ann Lee', email: 'ann@x.org' },
    { family_id: 'f2', name: 'Bo Ng', email: 'bo@x.org' },
  ]

  it('reports submitted and missing families per required registrant form', () => {
    const assignments = [assignment({ id: 'a1', template_name: 'Waiver' })]
    const signed = new Set(['f1:a1']) // only Ann signed
    const rows = summarizeFormCompletion(fams, assignments, signed)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ assignment_id: 'a1', submitted_count: 1, total: 2 })
    expect(rows[0].missing.map((m) => m.family_id)).toEqual(['f2'])
  })

  it('excludes non-required and non-registrant assignments', () => {
    const assignments = [
      assignment({ id: 'a1', required: false }),
      assignment({ id: 'a2', audience: 'staff' }),
    ]
    expect(summarizeFormCompletion(fams, assignments, new Set())).toEqual([])
  })

  it('returns 0 submitted with all families missing when nothing is signed', () => {
    const rows = summarizeFormCompletion(fams, [assignment({ id: 'a1' })], new Set())
    expect(rows[0].submitted_count).toBe(0)
    expect(rows[0].missing).toHaveLength(2)
  })
})
