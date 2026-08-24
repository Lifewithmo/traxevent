import { describe, it, expect } from 'vitest'
import { invoiceDateLocal, invoiceDateUTC, invoicePill, money0, money2 } from '@/lib/invoice-presentation'
import type { InvoiceAgingBucket, InvoiceLifecycle, InvoicePaymentStatus } from '@/lib/types'

function pill(
  lifecycle: InvoiceLifecycle,
  payment: InvoicePaymentStatus,
  aging: InvoiceAgingBucket = 'current',
) {
  return invoicePill({ lifecycle, payment, aging })
}

describe('invoicePill', () => {
  it('reads lifecycle for invoices where no money is owed yet', () => {
    expect(pill('draft', 'due')).toEqual({ tone: 'neutral', label: 'Draft' })
    expect(pill('void', 'void')).toEqual({ tone: 'neutral', label: 'Void' })
  })

  it('lets lifecycle win over money state for drafts and voids', () => {
    // A void invoice with payments on it is still Void, not Paid.
    expect(pill('void', 'paid', 'd90_plus').label).toBe('Void')
    expect(pill('draft', 'paid', 'd1_30').label).toBe('Draft')
  })

  it('promotes paid over everything else on a sent invoice', () => {
    expect(pill('sent', 'paid')).toEqual({ tone: 'confirmed', label: 'Paid' })
    expect(pill('sent', 'overpaid')).toEqual({ tone: 'confirmed', label: 'Paid' })
    // Paid beats an overdue due-date.
    expect(pill('sent', 'paid', 'd90_plus').label).toBe('Paid')
  })

  it('flags every overdue aging bucket as alert', () => {
    for (const bucket of ['d1_30', 'd31_60', 'd61_90', 'd90_plus'] as InvoiceAgingBucket[]) {
      expect(pill('sent', 'due', bucket)).toEqual({ tone: 'alert', label: 'Overdue' })
    }
    // Overdue beats partial payment.
    expect(pill('sent', 'partial', 'd1_30').label).toBe('Overdue')
  })

  it('distinguishes partial, due-today and plain sent', () => {
    expect(pill('sent', 'partial')).toEqual({ tone: 'pending', label: 'Partial' })
    expect(pill('sent', 'due', 'due_today')).toEqual({ tone: 'pending', label: 'Due today' })
    expect(pill('sent', 'due', 'due_soon')).toEqual({ tone: 'pending', label: 'Sent' })
    expect(pill('sent', 'not_due')).toEqual({ tone: 'pending', label: 'Sent' })
  })
})

describe('money formatting', () => {
  it('money0 rounds to whole dollars with thousands separators', () => {
    expect(money0(0)).toBe('$0')
    expect(money0(1234.4)).toBe('$1,234')
    expect(money0(1234.6)).toBe('$1,235')
  })

  it('money2 keeps cents', () => {
    expect(money2(0)).toBe('$0.00')
    expect(money2(1234.5)).toBe('$1234.50')
  })

  it('renders negatives with a minus sign ahead of the dollar sign', () => {
    expect(money0(-50)).toBe('−$50')
    expect(money2(-50)).toBe('−$50.00')
  })
})

// Run an assertion under an explicit process zone. Modern Node re-reads
// process.env.TZ, so this exercises the exact ambient-zone hazard the
// formatters exist to control — without depending on the host machine's zone.
function withTZ(tz: string, fn: () => void) {
  const prev = process.env.TZ
  process.env.TZ = tz
  try {
    fn()
  } finally {
    if (prev === undefined) delete process.env.TZ
    else process.env.TZ = prev
  }
}

// 02:30 UTC — the TZ-sensitive fixture: any zone west of UTC is still on the
// PREVIOUS calendar day at this instant (Denver reads Aug 12), any zone far
// enough east is already on the same/next day. If a formatter leaks the
// ambient zone, this instant exposes it.
const NEAR_MIDNIGHT_UTC = '2026-08-13T02:30:00.000Z'

describe('invoiceDateUTC — the pinned document date', () => {
  it('renders the UTC calendar date, identically in every process zone', () => {
    // Sanity that the fixture is genuinely zone-sensitive: viewer-local
    // formatting of the SAME instant reads a day earlier in Denver.
    withTZ('America/Denver', () => {
      expect(invoiceDateLocal(NEAR_MIDNIGHT_UTC)).toBe('Aug 12, 2026')
    })
    for (const tz of ['America/Denver', 'UTC', 'Pacific/Auckland']) {
      withTZ(tz, () => {
        expect(invoiceDateUTC(NEAR_MIDNIGHT_UTC)).toBe('Aug 13, 2026')
      })
    }
  })

  it('pins the locale too, so a server locale cannot restyle the face', () => {
    expect(invoiceDateUTC('2026-01-02T12:00:00.000Z')).toBe('Jan 2, 2026')
  })
})

describe('invoiceDateLocal — the viewer-local (gate-only) date', () => {
  it('follows the runtime zone by contract', () => {
    withTZ('Pacific/Auckland', () => {
      // UTC+12 in August: 14:30 on Aug 13 local.
      expect(invoiceDateLocal(NEAR_MIDNIGHT_UTC)).toBe('Aug 13, 2026')
    })
    withTZ('America/Denver', () => {
      expect(invoiceDateLocal(NEAR_MIDNIGHT_UTC)).toBe('Aug 12, 2026')
    })
  })
})
