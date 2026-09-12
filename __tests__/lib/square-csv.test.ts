import { describe, it, expect } from 'vitest'
import { parseSquareTransactionsCsv, type SquareCsvResult } from '@/lib/square-csv'

// A realistic Square Transactions-CSV shape: per-row Date + Total Collected
// among sibling columns the parser must ignore. The layout is unverified from
// primary sources (B4), which is exactly why every test here also asserts the
// FAILURE side: unknown layouts refuse, they never guess-sum.

const HEADER = 'Date,Time,Time Zone,Gross Sales,Discounts,Net Sales,Tax,Tip,Total Collected,Payment Method'

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n')
}

function okOrFail(r: SquareCsvResult) {
  return r.ok ? 'ok' : r.error
}

describe('parseSquareTransactionsCsv — happy path', () => {
  it('totals the Total Collected column for the event date', () => {
    const r = parseSquareTransactionsCsv(
      csv(
        '8/22/2026,09:14:03,MDT,$10.00,$0.00,$10.00,$0.60,$1.00,$11.60,Card',
        '8/22/2026,09:31:44,MDT,$4.50,$0.00,$4.50,$0.27,$0.00,$4.77,Cash',
      ),
      '2026-08-22',
    )
    expect(r).toEqual({
      ok: true, total: 16.37, rowCount: 2, refundCount: 0,
      dateMatched: '2026-08-22', currencyWarnings: [],
    })
  })

  it('parses quoted thousands money ("$1,234.56") and quoted fields with commas', () => {
    const r = parseSquareTransactionsCsv(
      csv('8/22/2026,10:00:00,MDT,"$1,240.00",$0.00,"$1,240.00",$0.00,$3.50,"$1,243.50","Card, tap"'),
      '2026-08-22',
    )
    expect(r).toMatchObject({ ok: true, total: 1243.5, rowCount: 1 })
  })

  it('accepts ISO row dates, a UTF-8 BOM, CRLF endings, and escaped quotes', () => {
    const text = '﻿' + [
      HEADER,
      '2026-08-22,10:00:00,MDT,$5.00,$0.00,$5.00,$0.00,$0.00,$5.00,"Note ""VIP"" card"',
      '',
    ].join('\r\n')
    const r = parseSquareTransactionsCsv(text, '2026-08-22')
    expect(r).toMatchObject({ ok: true, total: 5, rowCount: 1 })
  })

  it('is case/whitespace-tolerant on the headers it needs (B4 defensive detection)', () => {
    const text = ['DATE ,Time," Total   Collected "', '8/22/2026,09:00:00,$7.25'].join('\n')
    const r = parseSquareTransactionsCsv(text, '2026-08-22')
    expect(r).toMatchObject({ ok: true, total: 7.25, rowCount: 1 })
  })

  it('truncates a long ISO eventDate to its date part', () => {
    const r = parseSquareTransactionsCsv(
      csv('8/22/2026,09:00:00,MDT,$3.00,$0,$3.00,$0,$0,$3.00,Cash'),
      '2026-08-22T00:00:00.000Z',
    )
    expect(r).toMatchObject({ ok: true, dateMatched: '2026-08-22' })
  })
})

describe('multi-day exports', () => {
  it('filters to the event date only — other days never join the sum', () => {
    const r = parseSquareTransactionsCsv(
      csv(
        '8/21/2026,18:00:00,MDT,$99.00,$0,$99.00,$0,$0,$99.00,Card',
        '8/22/2026,09:00:00,MDT,$10.00,$0,$10.00,$0,$0,$10.00,Card',
        '8/22/2026,09:30:00,MDT,$20.00,$0,$20.00,$0,$0,$20.00,Cash',
        '8/23/2026,11:00:00,MDT,$50.00,$0,$50.00,$0,$0,$50.00,Card',
      ),
      '2026-08-22',
    )
    expect(r).toMatchObject({ ok: true, total: 30, rowCount: 2 })
  })

  it('reports no_rows_for_date when the export covers other days entirely', () => {
    const r = parseSquareTransactionsCsv(
      csv('8/21/2026,18:00:00,MDT,$99.00,$0,$99.00,$0,$0,$99.00,Card'),
      '2026-08-22',
    )
    expect(okOrFail(r)).toBe('no_rows_for_date')
  })

  it('ignores dateless footer/total rows instead of mis-summing them', () => {
    const r = parseSquareTransactionsCsv(
      csv(
        '8/22/2026,09:00:00,MDT,$10.00,$0,$10.00,$0,$0,$10.00,Card',
        'Total,,,,,,,,"$109.00",',
      ),
      '2026-08-22',
    )
    // The $109 footer must NOT join (or replace) the day's $10.
    expect(r).toMatchObject({ ok: true, total: 10, rowCount: 1 })
  })
})

describe('refunds (documented decision: refunds SUBTRACT)', () => {
  it('sums signed amounts and counts refund rows separately', () => {
    const r = parseSquareTransactionsCsv(
      csv(
        '8/22/2026,09:00:00,MDT,$50.00,$0,$50.00,$0,$0,$50.00,Card',
        '8/22/2026,10:00:00,MDT,-$5.00,$0,-$5.00,$0,$0,-$5.00,Card',
      ),
      '2026-08-22',
    )
    expect(r).toMatchObject({ ok: true, total: 45, rowCount: 2, refundCount: 1 })
  })

  it('reads parenthesized and U+2212 negatives', () => {
    // Net-positive day on purpose: a day netting negative is the designed
    // 'negative_total' failure (D6, below) — this test pins the two negative
    // NOTATIONS, both parsed and both counted as refunds.
    const r = parseSquareTransactionsCsv(
      csv(
        '8/22/2026,08:00:00,MDT,$50.00,$0,$50.00,$0,$0,$50.00,Card',
        '8/22/2026,09:00:00,MDT,$0,$0,$0,$0,$0,"($5.00)",Card',
        '8/22/2026,10:00:00,MDT,$0,$0,$0,$0,$0,−$2.50,Card',
      ),
      '2026-08-22',
    )
    expect(r).toMatchObject({ ok: true, total: 42.5, rowCount: 3, refundCount: 2 })
  })

  it('a day refunded down to exactly $0 still prefills — only a NEGATIVE day is refused', () => {
    const r = parseSquareTransactionsCsv(
      csv(
        '8/22/2026,09:00:00,MDT,$5.00,$0,$5.00,$0,$0,$5.00,Card',
        '8/22/2026,10:00:00,MDT,-$5.00,$0,-$5.00,$0,$0,-$5.00,Card',
      ),
      '2026-08-22',
    )
    expect(r).toMatchObject({ ok: true, total: 0, rowCount: 2, refundCount: 1 })
  })
})

describe('designed failures — never a guessed sum (B4)', () => {
  it('empty file', () => {
    expect(okOrFail(parseSquareTransactionsCsv('', '2026-08-22'))).toBe('empty_file')
    expect(okOrFail(parseSquareTransactionsCsv('\n\n', '2026-08-22'))).toBe('empty_file')
  })

  it('header-only export (layout fine, nothing sold)', () => {
    expect(okOrFail(parseSquareTransactionsCsv(HEADER, '2026-08-22'))).toBe('no_rows_for_date')
  })

  it('unknown headers — e.g. a Sales-Summary or Items export', () => {
    const summary = ['Sales,Amount', 'Gross Sales,"$1,240.00"', 'Net Sales,"$1,200.00"'].join('\n')
    expect(okOrFail(parseSquareTransactionsCsv(summary, '2026-08-22'))).toBe('unrecognized_layout')
  })

  it('a Date header whose cells never parse as dates is an unrecognized layout, not an empty day', () => {
    const text = ['Date,Total Collected', 'Week 34,$500.00'].join('\n')
    expect(okOrFail(parseSquareTransactionsCsv(text, '2026-08-22'))).toBe('unrecognized_layout')
  })

  it('an unreadable money cell ON the event date refuses the whole prefill (no partial sums)', () => {
    const r = parseSquareTransactionsCsv(
      csv(
        '8/22/2026,09:00:00,MDT,$10.00,$0,$10.00,$0,$0,$10.00,Card',
        '8/22/2026,10:00:00,MDT,$10.00,$0,$10.00,$0,$0,N/A,Card',
      ),
      '2026-08-22',
    )
    expect(okOrFail(r)).toBe('unreadable_money')
  })

  it('a day netting NEGATIVE (refunds exceed sales) is a typed designed failure, never a prefill (D6)', () => {
    // The closeout screen can never save a negative sales figure (client
    // validation AND the server's non-negative guard), so prefilling one
    // would show a number that silently drops on save.
    const r = parseSquareTransactionsCsv(
      csv(
        '8/22/2026,09:00:00,MDT,$10.00,$0,$10.00,$0,$0,$10.00,Card',
        '8/22/2026,10:00:00,MDT,-$25.00,$0,-$25.00,$0,$0,-$25.00,Card',
      ),
      '2026-08-22',
    )
    expect(r).toEqual({ ok: false, error: 'negative_total' })
  })

  it('an ambiguous comma pattern is unreadable, not guessable', () => {
    const r = parseSquareTransactionsCsv(
      csv('8/22/2026,09:00:00,MDT,$0,$0,$0,$0,$0,"1,2345",Card'),
      '2026-08-22',
    )
    expect(okOrFail(r)).toBe('unreadable_money')
  })
})

describe('locale-formatted money', () => {
  it('reads decimal-comma amounts ("1.234,56")', () => {
    const r = parseSquareTransactionsCsv(
      csv('22/08/2026,09:00:00,CET,,,,,,"1.234,56",Card'),
      '2026-08-22',
    )
    expect(r).toMatchObject({ ok: true, total: 1234.56, rowCount: 1 })
  })

  it('reads a bare decimal comma ("12,34") and an unambiguous D/M date', () => {
    const r = parseSquareTransactionsCsv(
      csv('22/08/2026,09:00:00,CET,,,,,,"12,34",Card'),
      '2026-08-22',
    )
    expect(r).toMatchObject({ ok: true, total: 12.34, rowCount: 1 })
  })

  it('flags non-$ currency marks as warnings while still totalling', () => {
    const r = parseSquareTransactionsCsv(
      csv('8/22/2026,09:00:00,CET,,,,,,"€1.234,56",Card'),
      '2026-08-22',
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.total).toBe(1234.56)
      expect(r.currencyWarnings).toHaveLength(1)
      expect(r.currencyWarnings[0]).toMatch(/€/)
    }
  })

  it('flags a spaced currency code ("CAD 12.00")', () => {
    const r = parseSquareTransactionsCsv(
      csv('8/22/2026,09:00:00,MST,,,,,,CAD 12.00,Card'),
      '2026-08-22',
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.total).toBe(12)
      expect(r.currencyWarnings[0]).toMatch(/CAD/)
    }
  })

  it('does not warn on plain-$ or bare-number amounts', () => {
    const r = parseSquareTransactionsCsv(
      csv(
        '8/22/2026,09:00:00,MDT,,,,,,$10.00,Card',
        '8/22/2026,09:10:00,MDT,,,,,,4.50,Cash',
      ),
      '2026-08-22',
    )
    expect(r).toMatchObject({ ok: true, total: 14.5, currencyWarnings: [] })
  })
})

describe('rounding', () => {
  it('rounds the float sum to cents', () => {
    const r = parseSquareTransactionsCsv(
      csv(
        '8/22/2026,09:00:00,MDT,,,,,,$0.10,Card',
        '8/22/2026,09:01:00,MDT,,,,,,$0.20,Card',
      ),
      '2026-08-22',
    )
    expect(r).toMatchObject({ ok: true, total: 0.3 })
  })
})
