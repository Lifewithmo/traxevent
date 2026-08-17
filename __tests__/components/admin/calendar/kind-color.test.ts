import { describe, it, expect } from 'vitest'
import { KIND_DOT } from '@/components/admin/calendar/kind-color'
import { CALENDAR_KINDS } from '@/lib/calendar'

describe('KIND_DOT', () => {
  it('assigns every kind a colour token', () => {
    for (const k of CALENDAR_KINDS) expect(KIND_DOT[k]).toMatch(/^var\(--/)
  })

  it('reserves money-green for actual money — not the event kind', () => {
    expect(KIND_DOT.event).not.toBe('var(--money-green)')
  })

  it('keeps event and drop separable (distinct tokens, not two near-identical greens)', () => {
    expect(KIND_DOT.event).not.toBe(KIND_DOT.drop)
    expect(KIND_DOT.event).not.toBe('var(--money-green-strong)')
  })

  it('gives all seven kinds a distinct colour token', () => {
    const vals = CALENDAR_KINDS.map((k) => KIND_DOT[k])
    expect(new Set(vals).size).toBe(vals.length)
  })
})
