import { describe, it, expect, vi, beforeEach } from 'vitest'

// Task 13: recordPayment auto-logs an 'invoice' activity event for the ONE
// payment that transitions an invoice's balance TO paid (or overpaid) — not
// for a partial payment, and not for a later payment recorded against an
// invoice that was already paid. Mirrors the mocking style of
// __tests__/actions/invoices.test.ts, but with a *stateful* fake invoice doc
// (get() always reflects the latest update()) — recordPayment now reads the
// invoice three times per call (its own before-snapshot, recordPaymentCore's
// internal read, and its own after-snapshot), and a static mocked response
// would return stale payments across those reads instead of exercising the
// real before/after transition logic.
const invoiceDocGetSpy = vi.hoisted(() => vi.fn())
const invoiceDocUpdateSpy = vi.hoisted(() => vi.fn())
const logActivitySpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => {
  const invoicesCol = {
    doc: vi.fn().mockImplementation(() => ({
      get: invoiceDocGetSpy,
      update: invoiceDocUpdateSpy,
    })),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) => (sub === 'invoices' ? invoicesCol : {})),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', email: 'admin@example.com' }),
}))

vi.mock('@/lib/activity', () => ({ logActivity: logActivitySpy }))

import { recordPayment } from '@/actions/invoices'

// A stateful fake invoice doc: .get() always reflects the latest .update()
// patch, the way a real Firestore doc would.
function seedInvoice(overrides: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {
    id: 'inv-1', lead_id: 'lead-1', lifecycle: 'sent',
    line_items: [{ description: 'DJ', quantity: 1, unit_price: 100 }],
    payments: [], created_at: '',
    ...overrides,
  }
  invoiceDocGetSpy.mockImplementation(async () => ({ exists: true, data: () => ({ ...state }) }))
  invoiceDocUpdateSpy.mockImplementation(async (patch: Record<string, unknown>) => {
    state = { ...state, ...patch }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('recordPayment — auto-logs the invoice-paid transition', () => {
  it('a partial payment logs no "invoice" activity event', async () => {
    seedInvoice()
    await recordPayment('org-1', 'inv-1', { amount: 40 })
    expect(logActivitySpy).not.toHaveBeenCalled()
  })

  it('the payment that closes the balance logs exactly one "invoice" paid event', async () => {
    seedInvoice()
    await recordPayment('org-1', 'inv-1', { amount: 40 }) // partial — no event
    await recordPayment('org-1', 'inv-1', { amount: 60 }) // closes the $100 balance — one event

    const invoiceEvents = logActivitySpy.mock.calls.filter(([, e]) => e.kind === 'invoice')
    expect(invoiceEvents).toHaveLength(1)
    expect(invoiceEvents[0]).toEqual([
      'org-1',
      { parent_type: 'opportunity', parent_id: 'lead-1', kind: 'invoice', summary: 'Invoice paid — $100.00' },
    ])
  })

  it('a single payment that covers the full balance logs one event', async () => {
    seedInvoice()
    await recordPayment('org-1', 'inv-1', { amount: 100 })
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', {
      parent_type: 'opportunity', parent_id: 'lead-1', kind: 'invoice', summary: 'Invoice paid — $100.00',
    })
    expect(logActivitySpy).toHaveBeenCalledTimes(1)
  })

  it('an overpayment in one shot also logs one event', async () => {
    seedInvoice()
    await recordPayment('org-1', 'inv-1', { amount: 150 })
    expect(logActivitySpy).toHaveBeenCalledTimes(1)
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', expect.objectContaining({ kind: 'invoice' }))
  })

  it('a further payment on an already-paid invoice does not log a second event', async () => {
    seedInvoice({ payments: [{ amount: 100, recorded_at: '2026-08-01T00:00:00.000Z' }] })
    // Already fully paid — a correction/overpayment recorded on top must not
    // re-fire the paid transition.
    await recordPayment('org-1', 'inv-1', { amount: 10 })
    expect(logActivitySpy).not.toHaveBeenCalled()
  })

  it('does not log when the payment amount is invalid (recordPaymentCore rejects first)', async () => {
    seedInvoice()
    await expect(recordPayment('org-1', 'inv-1', { amount: 0 })).rejects.toThrow(
      'Payment amount must be positive',
    )
    expect(logActivitySpy).not.toHaveBeenCalled()
  })

  it('does not log when recording a payment on a voided invoice (recordPaymentCore rejects)', async () => {
    seedInvoice({ lifecycle: 'void' })
    await expect(recordPayment('org-1', 'inv-1', { amount: 40 })).rejects.toThrow(
      'Cannot record payment on a voided invoice',
    )
    expect(logActivitySpy).not.toHaveBeenCalled()
  })
})
