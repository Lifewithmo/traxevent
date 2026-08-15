import { describe, it, expect } from 'vitest'
import { normalizeInvoice } from '@/lib/invoice-normalize'

const base = { id: 'i1', org_id: 'o1', lead_id: 'l1', token: 't', line_items: [], payments: [], created_at: '2026-01-01T00:00:00.000Z' }

describe('normalizeInvoice lifecycle mapping', () => {
  it.each([
    ['draft', 'draft'], ['sent', 'sent'], ['void', 'void'],          // current values pass through
    ['approved', 'draft'], ['issued', 'sent'], ['closed', 'sent'],   // retired lifecycle values
    ['voided', 'void'], ['replaced', 'void'],
  ])('maps at-rest lifecycle %s → %s', (atRest, expected) => {
    expect(normalizeInvoice({ ...base, lifecycle: atRest }).lifecycle).toBe(expected)
  })

  it.each([
    ['draft', 'draft'], ['sent', 'sent'], ['partial', 'sent'], ['paid', 'sent'], ['void', 'void'],
  ])('maps pre-lifecycle status %s → %s', (status, expected) => {
    expect(normalizeInvoice({ ...base, status }).lifecycle).toBe(expected)
  })

  it('defaults to draft when neither field exists', () => {
    expect(normalizeInvoice(base).lifecycle).toBe('draft')
  })
})
