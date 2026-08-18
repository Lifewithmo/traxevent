import { describe, it, expect } from 'vitest'
import { buildReminderMailto } from '@/lib/crm/reminder'
import type { Invoice } from '@/lib/types'

// Minimal invoice factory — only the fields the reminder builder reads.
// A $500 line with a $75 payment leaves a $425 BALANCE. Balance is kept distinct
// from the unit_price/gross (500) so the amount assertions pin the real remaining
// balance rather than passing on a coincidental subtotal or line price.
function inv(p: Partial<Invoice>): Invoice {
  return {
    id: 'i', org_id: 'o', lead_id: 'L1', type: 'final', lifecycle: 'sent',
    number: 'INV-1042', due_date: '2026-08-01', token: 'tok-abc',
    line_items: [{ description: 'Cart', quantity: 1, unit_price: 500 }],
    payments: [{ amount: 75, recorded_at: '2026-02-01T00:00:00.000Z' }],
    created_at: '2026-01-01T00:00:00.000Z',
    ...p,
  } as Invoice
}

describe('buildReminderMailto', () => {
  it('produces a mailto: href addressed to the customer', () => {
    const href = buildReminderMailto('client@example.com', inv({}))
    expect(href.startsWith('mailto:client@example.com?')).toBe(true)
  })

  it('encodes a subject carrying the invoice number, balance, and due date', () => {
    const href = buildReminderMailto('client@example.com', inv({ number: 'INV-1042', due_date: '2026-08-01' }))
    const url = new URL(href)
    const subject = url.searchParams.get('subject') ?? ''
    expect(subject).toContain('INV-1042')
    expect(subject).toContain('425') // remaining BALANCE (500 line − 75 paid)
    expect(subject).not.toContain('500') // never the gross/line price
    expect(subject).toContain('2026-08-01')
  })

  it('includes the token pay link and the remaining balance in the (encoded) body', () => {
    const href = buildReminderMailto('client@example.com', inv({ token: 'tok-abc' }))
    const url = new URL(href)
    const body = url.searchParams.get('body') ?? ''
    expect(body).toContain('/invoices/tok-abc')
    expect(body).toContain('425') // the balance, not the gross
  })

  it('escapes special characters in the subject so the query is well-formed', () => {
    // The raw (unescaped) em-dash separator must be percent-encoded in the href.
    const href = buildReminderMailto('client@example.com', inv({}))
    expect(href).toContain('%')
    // And it must round-trip back to a readable subject via URL parsing.
    const url = new URL(href)
    expect(url.searchParams.get('subject')).toContain('Reminder: Invoice INV-1042')
  })
})
