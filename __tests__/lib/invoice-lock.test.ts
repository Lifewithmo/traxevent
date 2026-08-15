import { describe, it, expect } from 'vitest'
import { assertEditable, InvoiceLockedError, LOCKED_LIFECYCLES } from '@/lib/invoice-lock'

describe('assertEditable', () => {
  it('allows any edit on draft', () => {
    expect(() => assertEditable('draft', ['line_items', 'due_date'])).not.toThrow()
    expect(() => assertEditable('draft', ['type'])).not.toThrow()
  })
  it('allows editing notes even when locked', () => {
    expect(() => assertEditable('sent', ['notes'])).not.toThrow()
  })
  it('throws when a financial field is edited on a locked invoice', () => {
    for (const l of LOCKED_LIFECYCLES) {
      expect(() => assertEditable(l, ['line_items'])).toThrow(InvoiceLockedError)
    }
    expect(() => assertEditable('sent', ['notes', 'due_date'])).toThrow(/locked/i)
  })
  it('locks discount, tax_rate, and credits on sent invoices', () => {
    for (const k of ['discount', 'tax_rate', 'credits']) {
      expect(() => assertEditable('sent', [k])).toThrow(/locked/i)
    }
  })
})
