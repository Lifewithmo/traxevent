import { describe, it, expect } from 'vitest'
import { derivePaymentStatus, deriveAging, resolveTipsEnabled, INVOICE_LIFECYCLE_LABELS, INVOICE_LIFECYCLES } from '@/lib/invoice-status'

const now = new Date('2026-08-04T12:00:00Z')

describe('derivePaymentStatus', () => {
  it('void regardless of money', () => {
    expect(derivePaymentStatus({ total: 100, applied: 0, lifecycle: 'void' }, now)).toBe('void')
    expect(derivePaymentStatus({ total: 100, applied: 50, lifecycle: 'void' }, now)).toBe('void')
  })
  it('paid when fully covered, overpaid when applied exceeds total', () => {
    expect(derivePaymentStatus({ total: 100, applied: 100, lifecycle: 'sent' }, now)).toBe('paid')
    expect(derivePaymentStatus({ total: 100, applied: 120, lifecycle: 'sent' }, now)).toBe('overpaid')
  })
  it('partial when some paid but not full', () => {
    expect(derivePaymentStatus({ total: 100, applied: 40, lifecycle: 'sent' }, now)).toBe('partial')
  })
  it('not_due before due date, due on/after due date when nothing paid', () => {
    expect(derivePaymentStatus({ total: 100, applied: 0, lifecycle: 'sent', dueDate: '2026-08-10' }, now)).toBe('not_due')
    expect(derivePaymentStatus({ total: 100, applied: 0, lifecycle: 'sent', dueDate: '2026-08-01' }, now)).toBe('due')
  })
  it('due when sent with no due date and nothing paid', () => {
    expect(derivePaymentStatus({ total: 100, applied: 0, lifecycle: 'sent' }, now)).toBe('due')
  })
})

describe('deriveAging', () => {
  it('current when no due date or zero balance', () => {
    expect(deriveAging({ balance: 0, lifecycle: 'sent', dueDate: '2026-01-01' }, now)).toBe('current')
    expect(deriveAging({ balance: 100, lifecycle: 'sent' }, now)).toBe('current')
  })
  it('due_today / due_soon / overdue buckets', () => {
    expect(deriveAging({ balance: 100, lifecycle: 'sent', dueDate: '2026-08-04' }, now)).toBe('due_today')
    expect(deriveAging({ balance: 100, lifecycle: 'sent', dueDate: '2026-08-06' }, now)).toBe('due_soon')
    expect(deriveAging({ balance: 100, lifecycle: 'sent', dueDate: '2026-07-20' }, now)).toBe('d1_30')
    expect(deriveAging({ balance: 100, lifecycle: 'sent', dueDate: '2026-06-20' }, now)).toBe('d31_60')
    expect(deriveAging({ balance: 100, lifecycle: 'sent', dueDate: '2026-04-01' }, now)).toBe('d90_plus')
  })
})

describe('resolveTipsEnabled', () => {
  it('invoice value wins, then org, then false', () => {
    expect(resolveTipsEnabled(undefined, undefined)).toBe(false)
    expect(resolveTipsEnabled(undefined, true)).toBe(true)
    expect(resolveTipsEnabled(false, true)).toBe(false)   // global on, this invoice off
    expect(resolveTipsEnabled(true, false)).toBe(true)
  })
})

describe('lifecycle labels', () => {
  it('every lifecycle has a label', () => {
    for (const l of INVOICE_LIFECYCLES) expect(INVOICE_LIFECYCLE_LABELS[l]).toBeTruthy()
  })
})
