import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/firebase-admin', () => ({ adminDb: {}, adminAuth: {} }))
import { leadToCustomerInput } from '@/scripts/crm-migrate-customers'

describe('leadToCustomerInput', () => {
  it('maps lead contact fields to a customer input', () => {
    expect(leadToCustomerInput({ id:'l', name:'Dana Kim', organization:'Riverside Corp', email:'dana@riv.co', phone:'555', stage:'inquiry', created_at:'' } as any))
      .toEqual({ name:'Dana Kim', company:'Riverside Corp', email:'dana@riv.co', phone:'555' })
  })
  it('omits missing optional fields', () => {
    expect(leadToCustomerInput({ id:'l', name:'Sam', stage:'inquiry', created_at:'' } as any)).toEqual({ name:'Sam' })
  })
})
