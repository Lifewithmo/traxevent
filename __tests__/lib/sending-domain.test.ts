import { describe, it, expect, vi, beforeEach } from 'vitest'

// lib/sending-domain — the guard-free read extracted from actions/domains.ts
// (inc-3 B5). Same behavior contract the old action test pinned, plus the
// security decision on the record: the 'use server' export was DELETED, not
// guarded — a member assert would have broken the unauthenticated callers
// (payments webhook, public proposal/registration/form/drop flows), which
// gate by other means and now import this core directly.

const orgDocGet = vi.hoisted(() => vi.fn())
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: orgDocGet }) }) },
}))

import { getVerifiedSendingDomainCore } from '@/lib/sending-domain'

beforeEach(() => vi.clearAllMocks())

describe('getVerifiedSendingDomainCore', () => {
  it('returns the domain when status is verified', async () => {
    orgDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ sending_domain: 'mail.firsthills.org', sending_domain_status: 'verified' }),
    })
    await expect(getVerifiedSendingDomainCore('org-1')).resolves.toBe('mail.firsthills.org')
  })

  it('returns undefined when status is pending', async () => {
    orgDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ sending_domain: 'mail.firsthills.org', sending_domain_status: 'pending' }),
    })
    await expect(getVerifiedSendingDomainCore('org-1')).resolves.toBeUndefined()
  })

  it('returns undefined when no domain is set', async () => {
    orgDocGet.mockResolvedValue({ exists: true, data: () => ({}) })
    await expect(getVerifiedSendingDomainCore('org-1')).resolves.toBeUndefined()
  })

  it('returns undefined when the org does not exist', async () => {
    orgDocGet.mockResolvedValue({ exists: false, data: () => undefined })
    await expect(getVerifiedSendingDomainCore('missing')).resolves.toBeUndefined()
  })
})
