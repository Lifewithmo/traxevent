import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  orgsWhereGetSpy, membersGetSpy, checkRateLimitSpy,
  findOrCreateSpy, createLeadCoreSpy, logActivitySpy, sendIntakeSpy,
} = vi.hoisted(() => ({
  orgsWhereGetSpy: vi.fn(),
  membersGetSpy: vi.fn(),
  checkRateLimitSpy: vi.fn().mockResolvedValue({ allowed: true }),
  findOrCreateSpy: vi.fn().mockResolvedValue({
    customer: { id: 'cust-1', name: 'Ada', created_at: 'x' }, created: true,
  }),
  createLeadCoreSpy: vi.fn().mockResolvedValue({
    id: 'lead-1', name: 'Ada', stage: 'inquiry', customer_id: 'cust-1', created_at: 'x',
  }),
  logActivitySpy: vi.fn().mockResolvedValue(undefined),
  sendIntakeSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: orgsWhereGetSpy })) })),
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => ({ get: membersGetSpy })) })),
        })),
      })),
    })),
  },
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitSpy }))
vi.mock('@/lib/crm/customers', () => ({ findOrCreateCustomerCore: findOrCreateSpy }))
vi.mock('@/lib/crm/leads', () => ({ createLeadCore: createLeadCoreSpy }))
vi.mock('@/lib/activity', () => ({ logActivity: logActivitySpy }))
vi.mock('@/lib/email', () => ({ sendIntakeNotification: sendIntakeSpy }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([['x-forwarded-for', '203.0.113.7, 10.0.0.1']])),
}))

import { getIntakeFormInfo, submitIntake } from '@/actions/intake-public'

function mockOrg(data: Record<string, unknown> | null) {
  if (data === null) {
    orgsWhereGetSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  orgsWhereGetSpy.mockResolvedValue({
    empty: false,
    docs: [{ id: 'org-1', data: () => data }],
  })
}

const ORG = { id: 'org-1', name: 'Brew Cart Co', slug: 'brewcart', intake_token: 'tok_intake' }

function submission(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ada Lovelace',
    email: 'Ada@Example.com',
    phone: '555-1234',
    event_type: 'Wedding',
    event_date: '2026-10-10',
    guest_count: 120,
    message: 'Looking forward to it',
    website: '',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimitSpy.mockResolvedValue({ allowed: true })
  findOrCreateSpy.mockResolvedValue({
    customer: { id: 'cust-1', name: 'Ada', created_at: 'x' }, created: true,
  })
  createLeadCoreSpy.mockResolvedValue({
    id: 'lead-1', name: 'Ada', stage: 'inquiry', customer_id: 'cust-1', created_at: 'x',
  })
  membersGetSpy.mockResolvedValue({
    empty: false,
    docs: [{ data: () => ({ uid: 'u1', role: 'owner', email: 'owner@example.com' }) }],
  })
})

describe('getIntakeFormInfo', () => {
  it('returns null for an unknown token', async () => {
    mockOrg(null)
    expect(await getIntakeFormInfo('nope')).toBeNull()
  })

  it('returns only the org display name', async () => {
    mockOrg({ ...ORG, branding: { display_name: 'Brew Cart ☕' }, stripe_customer_id: 'cus_secret' })
    expect(await getIntakeFormInfo('tok_intake')).toEqual({ org_name: 'Brew Cart ☕' })
  })

  it('falls back to org name without branding', async () => {
    mockOrg(ORG)
    expect(await getIntakeFormInfo('tok_intake')).toEqual({ org_name: 'Brew Cart Co' })
  })
})

describe('submitIntake', () => {
  it('rejects an unknown token with a generic error', async () => {
    mockOrg(null)
    await expect(submitIntake('nope', submission(), 5000)).rejects.toThrow(
      'This form is no longer available.'
    )
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
  })

  it('honeypot filled: fake success, zero writes', async () => {
    mockOrg(ORG)
    expect(await submitIntake('tok_intake', submission({ website: 'http://spam' }), 5000)).toEqual({ ok: true })
    expect(findOrCreateSpy).not.toHaveBeenCalled()
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
    expect(checkRateLimitSpy).not.toHaveBeenCalled()
  })

  it('too-fast submission: fake success, zero writes', async () => {
    mockOrg(ORG)
    expect(await submitIntake('tok_intake', submission(), 900)).toEqual({ ok: true })
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
  })

  it('denies when a rate limit is exceeded', async () => {
    mockOrg(ORG)
    checkRateLimitSpy.mockResolvedValueOnce({ allowed: false })
    await expect(submitIntake('tok_intake', submission(), 5000)).rejects.toThrow(
      'Too many requests — please try again later.'
    )
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
  })

  it('checks a hashed-ip key and an org key', async () => {
    mockOrg(ORG)
    await submitIntake('tok_intake', submission(), 5000)
    const keys = checkRateLimitSpy.mock.calls.map((c) => c[0] as string)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^intake:ip:[0-9a-f]{64}$/)
    expect(keys[0]).not.toContain('203.0.113.7')
    expect(keys[1]).toBe('intake:org:org-1')
  })

  it('rejects missing name, invalid email, and over-cap fields', async () => {
    mockOrg(ORG)
    await expect(submitIntake('tok_intake', submission({ name: '  ' }), 5000)).rejects.toThrow(
      'Please enter your name.'
    )
    await expect(submitIntake('tok_intake', submission({ email: 'not-an-email' }), 5000)).rejects.toThrow(
      'Please enter a valid email address.'
    )
    await expect(
      submitIntake('tok_intake', submission({ message: 'x'.repeat(2001) }), 5000)
    ).rejects.toThrow('Please keep your message under 2000 characters.')
    await expect(
      submitIntake('tok_intake', submission({ event_date: '10/10/2026' }), 5000)
    ).rejects.toThrow('Please pick a valid event date.')
    await expect(
      submitIntake('tok_intake', submission({ guest_count: 3.5 }), 5000)
    ).rejects.toThrow('Please enter a valid guest count.')
    expect(createLeadCoreSpy).not.toHaveBeenCalled()
  })

  it('creates customer then lead at inquiry with the message as notes', async () => {
    mockOrg(ORG)
    await submitIntake('tok_intake', submission(), 5000)
    expect(findOrCreateSpy).toHaveBeenCalledWith('org-1', {
      name: 'Ada Lovelace', email: 'Ada@Example.com', phone: '555-1234',
    })
    expect(createLeadCoreSpy).toHaveBeenCalledWith('org-1', {
      name: 'Ada Lovelace', stage: 'inquiry', customer_id: 'cust-1', source: 'intake',
      email: 'Ada@Example.com', phone: '555-1234', event_type: 'Wedding',
      event_date: '2026-10-10', guest_count: 120, notes: 'Looking forward to it',
    })
  })

  it('logs a form activity event on the new opportunity', async () => {
    mockOrg(ORG)
    await submitIntake('tok_intake', submission(), 5000)
    expect(logActivitySpy).toHaveBeenCalledWith('org-1', {
      parent_type: 'opportunity', parent_id: 'lead-1', kind: 'form',
      summary: 'New inquiry from intake form',
    })
  })

  it('emails the owner with a link to the opportunity', async () => {
    mockOrg(ORG)
    await submitIntake('tok_intake', submission(), 5000)
    expect(sendIntakeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        orgName: 'Brew Cart Co',
        leadName: 'Ada Lovelace',
        opportunityUrl: expect.stringContaining('/brewcart/leads/lead-1'),
      })
    )
  })

  it('email failure does not fail the submission', async () => {
    mockOrg(ORG)
    sendIntakeSpy.mockRejectedValueOnce(new Error('resend down'))
    expect(await submitIntake('tok_intake', submission(), 5000)).toEqual({ ok: true })
  })

  it('missing owner member: no email, still succeeds', async () => {
    mockOrg(ORG)
    membersGetSpy.mockResolvedValue({ empty: true, docs: [] })
    expect(await submitIntake('tok_intake', submission(), 5000)).toEqual({ ok: true })
    expect(sendIntakeSpy).not.toHaveBeenCalled()
  })
})
