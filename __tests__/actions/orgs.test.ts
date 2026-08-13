import { describe, it, expect, vi, beforeEach } from 'vitest'

const orgDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const fieldValueDeleteSentinel = vi.hoisted(() => ({ __op: 'delete' }))

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { setCustomUserClaims: vi.fn().mockResolvedValue(undefined) },
  adminDb: {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(),
    update: orgDocUpdateSpy,
  },
}))

vi.mock('@/actions/auth', () => ({
  setOrgClaims: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn().mockReturnValue(fieldValueDeleteSentinel) },
}))

import { slugify } from '@/lib/slug'
import { updateOrgDefaultProposalTerms } from '@/actions/orgs'
import { MAX_TERMS_CHARS } from '@/lib/proposals/draft'

beforeEach(() => vi.clearAllMocks())

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('First Hills Fellowship')).toBe('first-hills-fellowship')
  })

  it('strips special characters', () => {
    expect(slugify("St. Mary's Church")).toBe('st-marys-church')
  })

  it('collapses multiple spaces/hyphens', () => {
    expect(slugify('A  B')).toBe('a-b')
  })
})

describe('updateOrgDefaultProposalTerms', () => {
  it('trims and stores terms, returning what was stored', async () => {
    const stored = await updateOrgDefaultProposalTerms('org-1', '  Balance due 7 days out.  ')
    expect(stored).toBe('Balance due 7 days out.')
    expect(orgDocUpdateSpy).toHaveBeenCalledWith({ default_proposal_terms: 'Balance due 7 days out.' })
  })

  it('clears the field when given blank input', async () => {
    const stored = await updateOrgDefaultProposalTerms('org-1', '   ')
    expect(stored).toBe('')
    const arg = orgDocUpdateSpy.mock.calls.at(-1)![0]
    expect(arg.default_proposal_terms).toBe(fieldValueDeleteSentinel)
  })

  it('caps at MAX_TERMS_CHARS', async () => {
    const stored = await updateOrgDefaultProposalTerms('org-1', 'x'.repeat(MAX_TERMS_CHARS + 1))
    expect(stored).toHaveLength(MAX_TERMS_CHARS)
  })
})
