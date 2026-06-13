import { describe, it, expect } from 'vitest'
import { isFieldVisible, getVisibleFields } from '@/lib/forms'
import type { FormField } from '@/lib/types'

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
