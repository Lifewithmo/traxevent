import { describe, it, expect, vi, beforeEach } from 'vitest'

const orgUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const domainsCreateSpy = vi.hoisted(() => vi.fn())
const domainsVerifySpy = vi.hoisted(() => vi.fn())
const domainsGetSpy = vi.hoisted(() => vi.fn())
const domainsRemoveSpy = vi.hoisted(() => vi.fn())
const getOrgSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({ update: orgUpdateSpy }),
    }),
  },
}))

vi.mock('@/lib/resend', () => ({
  FROM_EMAIL: 'noreply@traxevent.com',
  getResend: vi.fn().mockReturnValue({
    domains: {
      create: domainsCreateSpy,
      verify: domainsVerifySpy,
      get: domainsGetSpy,
      remove: domainsRemoveSpy,
    },
  }),
}))

vi.mock('@/actions/orgs', () => ({ getOrg: getOrgSpy }))

import {
  createSendingDomain,
  verifySendingDomain,
  removeSendingDomain,
  getVerifiedSendingDomain,
} from '@/actions/domains'

describe('createSendingDomain', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a Resend domain and stores id, status, and DNS records on the org', async () => {
    domainsCreateSpy.mockResolvedValue({
      data: {
        id: 'dom_123',
        name: 'mail.firsthills.org',
        status: 'pending',
        records: [
          { record: 'SPF', name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', ttl: 'Auto' },
          { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=MIGf...', ttl: 'Auto' },
        ],
      },
      error: null,
    })

    const result = await createSendingDomain('org-1', 'mail.firsthills.org')

    expect(domainsCreateSpy).toHaveBeenCalledWith({ name: 'mail.firsthills.org' })
    expect(orgUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sending_domain: 'mail.firsthills.org',
        sending_domain_id: 'dom_123',
        sending_domain_status: 'pending',
        sending_domain_records: [
          { record: 'SPF', name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', ttl: 'Auto' },
          { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=MIGf...', ttl: 'Auto' },
        ],
      })
    )
    expect(result.status).toBe('pending')
    expect(result.records).toHaveLength(2)
  })

  it('throws when Resend returns an error', async () => {
    domainsCreateSpy.mockResolvedValue({ data: null, error: { message: 'Domain already exists' } })
    await expect(createSendingDomain('org-1', 'taken.org')).rejects.toThrow('Domain already exists')
    expect(orgUpdateSpy).not.toHaveBeenCalled()
  })
})

describe('verifySendingDomain', () => {
  beforeEach(() => vi.clearAllMocks())

  it('triggers verify, re-reads status, and stores verified', async () => {
    getOrgSpy.mockResolvedValue({ id: 'org-1', sending_domain_id: 'dom_123' })
    domainsVerifySpy.mockResolvedValue({ data: { id: 'dom_123' }, error: null })
    domainsGetSpy.mockResolvedValue({ data: { id: 'dom_123', status: 'verified' }, error: null })

    const result = await verifySendingDomain('org-1')

    expect(domainsVerifySpy).toHaveBeenCalledWith('dom_123')
    expect(domainsGetSpy).toHaveBeenCalledWith('dom_123')
    expect(orgUpdateSpy).toHaveBeenCalledWith({ sending_domain_status: 'verified' })
    expect(result.status).toBe('verified')
  })

  it('maps a failed status to failed', async () => {
    getOrgSpy.mockResolvedValue({ id: 'org-1', sending_domain_id: 'dom_123' })
    domainsVerifySpy.mockResolvedValue({ data: { id: 'dom_123' }, error: null })
    domainsGetSpy.mockResolvedValue({ data: { id: 'dom_123', status: 'failed' }, error: null })

    const result = await verifySendingDomain('org-1')
    expect(result.status).toBe('failed')
    expect(orgUpdateSpy).toHaveBeenCalledWith({ sending_domain_status: 'failed' })
  })

  it('throws when org has no sending domain', async () => {
    getOrgSpy.mockResolvedValue({ id: 'org-1' })
    await expect(verifySendingDomain('org-1')).rejects.toThrow('No sending domain to verify')
    expect(domainsVerifySpy).not.toHaveBeenCalled()
  })
})

describe('removeSendingDomain', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes the Resend domain and clears the org fields', async () => {
    getOrgSpy.mockResolvedValue({ id: 'org-1', sending_domain_id: 'dom_123' })
    domainsRemoveSpy.mockResolvedValue({ data: { deleted: true }, error: null })

    await removeSendingDomain('org-1')

    expect(domainsRemoveSpy).toHaveBeenCalledWith('dom_123')
    expect(orgUpdateSpy).toHaveBeenCalledWith({
      sending_domain: null,
      sending_domain_id: null,
      sending_domain_status: null,
      sending_domain_records: null,
    })
  })

  it('clears org fields even when no Resend domain id exists', async () => {
    getOrgSpy.mockResolvedValue({ id: 'org-1' })
    await removeSendingDomain('org-1')
    expect(domainsRemoveSpy).not.toHaveBeenCalled()
    expect(orgUpdateSpy).toHaveBeenCalled()
  })
})

describe('getVerifiedSendingDomain', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the domain when status is verified', async () => {
    getOrgSpy.mockResolvedValue({ id: 'org-1', sending_domain: 'mail.firsthills.org', sending_domain_status: 'verified' })
    const domain = await getVerifiedSendingDomain('org-1')
    expect(domain).toBe('mail.firsthills.org')
  })

  it('returns undefined when status is pending', async () => {
    getOrgSpy.mockResolvedValue({ id: 'org-1', sending_domain: 'mail.firsthills.org', sending_domain_status: 'pending' })
    const domain = await getVerifiedSendingDomain('org-1')
    expect(domain).toBeUndefined()
  })

  it('returns undefined when no domain is set', async () => {
    getOrgSpy.mockResolvedValue({ id: 'org-1' })
    const domain = await getVerifiedSendingDomain('org-1')
    expect(domain).toBeUndefined()
  })
})
