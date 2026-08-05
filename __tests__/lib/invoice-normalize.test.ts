import { describe, it, expect } from 'vitest'
import { normalizeInvoice, formatInvoiceNumber } from '@/lib/invoice-normalize'

const base = {
  id: 'i1', org_id: 'o1', lead_id: 'l1', token: 't', line_items: [], payments: [], created_at: '2026-01-01',
}

describe('normalizeInvoice legacy status mapping', () => {
  it('maps draft -> draft', () => {
    expect(normalizeInvoice({ ...base, status: 'draft' }).lifecycle).toBe('draft')
  })
  it('maps sent/partial/paid -> issued', () => {
    expect(normalizeInvoice({ ...base, status: 'sent' }).lifecycle).toBe('issued')
    expect(normalizeInvoice({ ...base, status: 'partial' }).lifecycle).toBe('issued')
    expect(normalizeInvoice({ ...base, status: 'paid' }).lifecycle).toBe('issued')
  })
  it('maps void -> voided', () => {
    expect(normalizeInvoice({ ...base, status: 'void' }).lifecycle).toBe('voided')
  })
  it('fills defaults for type/delivery/accounting/dispute when absent', () => {
    const n = normalizeInvoice({ ...base, status: 'draft' })
    expect(n.type).toBe('quick')
    expect(n.delivery).toBe('not_sent')
    expect(n.accounting).toBe('not_connected')
    expect(n.dispute).toBe('none')
  })
  it('prefers new lifecycle when already present (v2 doc)', () => {
    const n = normalizeInvoice({ ...base, lifecycle: 'approved', type: 'deposit' })
    expect(n.lifecycle).toBe('approved')
    expect(n.type).toBe('deposit')
  })
  it('does not mutate the input', () => {
    const raw = { ...base, status: 'sent' as const }
    normalizeInvoice(raw)
    expect(raw).not.toHaveProperty('lifecycle')
  })
})

describe('formatInvoiceNumber', () => {
  it('prefixes when given, plain sequence otherwise', () => {
    expect(formatInvoiceNumber(1001)).toBe('1001')
    expect(formatInvoiceNumber(1001, 'INV-')).toBe('INV-1001')
  })
})
