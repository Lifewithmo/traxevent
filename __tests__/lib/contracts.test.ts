import { describe, it, expect } from 'vitest'
import { CONTRACT_STATUSES, CONTRACT_STATUS_LABELS, canSignContract } from '@/lib/contracts'

describe('CONTRACT_STATUSES', () => {
  it('is the three statuses with labels', () => {
    expect(CONTRACT_STATUSES).toEqual(['draft', 'sent', 'signed'])
    for (const s of CONTRACT_STATUSES) expect(CONTRACT_STATUS_LABELS[s]).toBeTruthy()
  })
})

describe('canSignContract', () => {
  it('is signable only when sent', () => {
    expect(canSignContract('sent')).toBe(true)
    expect(canSignContract('draft')).toBe(false)
    expect(canSignContract('signed')).toBe(false)
  })
})
