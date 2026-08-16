import { describe, it, expect } from 'vitest'
import {
  STAGE_TONE, DUE_TONE, PROPOSAL_TONE, INVOICE_LIFECYCLE_TONE, VENDOR_TONE,
  money, shortDate,
} from '@/lib/pipeline-presentation'
import { LEAD_STAGES } from '@/lib/leads'
import { PROPOSAL_STATUS_LABELS } from '@/lib/proposals'
import { INVOICE_LIFECYCLES } from '@/lib/invoice-status'
import { VENDOR_STATUSES } from '@/lib/vendors'
import { dueStatus } from '@/lib/opportunity-detail'

const TONES = ['confirmed', 'pending', 'alert', 'neutral']

describe('pipeline tone maps', () => {
  it('STAGE_TONE covers every lead stage with a real pill tone', () => {
    for (const stage of LEAD_STAGES) {
      expect(STAGE_TONE[stage], `missing tone for stage ${stage}`).toBeDefined()
      expect(TONES).toContain(STAGE_TONE[stage])
    }
    expect(Object.keys(STAGE_TONE).sort()).toEqual([...LEAD_STAGES].sort())
  })

  it('STAGE_TONE separates the two closed outcomes instead of one gray badge', () => {
    expect(STAGE_TONE.closed_won).toBe('confirmed')
    expect(STAGE_TONE.closed_lost).toBe('alert')
    expect(STAGE_TONE.inquiry).toBe('neutral')
  })

  it('DUE_TONE covers every value dueStatus() can return', () => {
    const returned = [
      dueStatus('2026-08-01', '2026-08-15'),
      dueStatus('2026-08-15', '2026-08-15'),
      dueStatus('2026-09-01', '2026-08-15'),
    ]
    expect(returned).toEqual(['overdue', 'today', 'upcoming'])
    for (const s of returned) expect(TONES).toContain(DUE_TONE[s])
    expect(DUE_TONE.overdue).toBe('alert')
    expect(Object.keys(DUE_TONE).sort()).toEqual(['overdue', 'today', 'upcoming'])
  })

  it('PROPOSAL_TONE covers every proposal status', () => {
    const statuses = Object.keys(PROPOSAL_STATUS_LABELS)
    for (const s of statuses) {
      expect(PROPOSAL_TONE[s as keyof typeof PROPOSAL_TONE], `missing tone for ${s}`).toBeDefined()
    }
    expect(Object.keys(PROPOSAL_TONE).sort()).toEqual([...statuses].sort())
    expect(PROPOSAL_TONE.accepted).toBe('confirmed')
    expect(PROPOSAL_TONE.rejected).toBe('alert')
    expect(PROPOSAL_TONE.voided).toBe('alert')
  })

  it('INVOICE_LIFECYCLE_TONE covers every invoice lifecycle', () => {
    for (const l of INVOICE_LIFECYCLES) expect(TONES).toContain(INVOICE_LIFECYCLE_TONE[l])
    expect(Object.keys(INVOICE_LIFECYCLE_TONE).sort()).toEqual([...INVOICE_LIFECYCLES].sort())
    expect(INVOICE_LIFECYCLE_TONE.sent).toBe('pending')
    expect(INVOICE_LIFECYCLE_TONE.void).toBe('neutral')
  })

  it('VENDOR_TONE covers every vendor status and only confirms the confirmed one', () => {
    for (const s of VENDOR_STATUSES) expect(TONES).toContain(VENDOR_TONE[s])
    expect(Object.keys(VENDOR_TONE).sort()).toEqual([...VENDOR_STATUSES].sort())
    expect(VENDOR_TONE.confirmed).toBe('confirmed')
    expect(VENDOR_TONE.potential).toBe('pending')
    expect(VENDOR_TONE.declined).toBe('pending')
  })
})

describe('money', () => {
  it('groups thousands with a separator and no cents', () => {
    expect(money(1234)).toBe('$1,234')
  })
  it('renders zero and large values', () => {
    expect(money(0)).toBe('$0')
    expect(money(1234567)).toBe('$1,234,567')
  })
})

describe('shortDate', () => {
  it('renders a YYYY-MM-DD as a readable month/day/year without timezone drift', () => {
    expect(shortDate('2026-08-30')).toBe('Aug 30, 2026')
    expect(shortDate('2026-01-01')).toBe('Jan 1, 2026')
  })

  it('renders December, the last month, rather than running off the lookup', () => {
    expect(shortDate('2026-12-31')).toBe('Dec 31, 2026')
  })

  it('returns malformed input unchanged instead of "undefined NaN, NaN"', () => {
    for (const bad of ['2026-08-30T14:00:00.000Z', 'next Friday', '2026-13-01', '2026-00-05', '']) {
      const out = shortDate(bad)
      expect(out, `expected ${JSON.stringify(bad)} back unchanged`).toBe(bad)
      expect(out).not.toContain('undefined')
      expect(out).not.toContain('NaN')
    }
  })
})
