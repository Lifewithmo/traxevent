import { describe, it, expect, vi, beforeEach } from 'vitest'

const familySetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const memberSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const attachAccessTokenSpy = vi.hoisted(() => vi.fn().mockResolvedValue('tok_abc'))
const sendEmailSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getFamiliesSpy = vi.hoisted(() => vi.fn())
const getCampSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockImplementation((col: string) => {
      if (col === 'orgs') {
        return {
          doc: vi.fn().mockReturnValue({
            collection: vi.fn().mockImplementation((sub: string) => {
              if (sub === 'camps') {
                return {
                  doc: vi.fn().mockReturnValue({
                    get: getCampSpy,
                    collection: vi.fn().mockImplementation((sub2: string) => {
                      if (sub2 === 'families') {
                        return {
                          doc: vi.fn().mockReturnValue({
                            set: familySetSpy,
                            collection: vi.fn().mockReturnValue({
                              doc: vi.fn().mockReturnValue({ set: memberSetSpy }),
                            }),
                          }),
                          get: getFamiliesSpy,
                        }
                      }
                      return {}
                    }),
                  }),
                }
              }
              return {}
            }),
          }),
        }
      }
      return {}
    }),
  },
}))

vi.mock('@/actions/access-tokens', () => ({ attachAccessToken: attachAccessTokenSpy }))
vi.mock('@/lib/email', () => ({ sendRegistrationConfirmation: sendEmailSpy }))
vi.mock('@/actions/domains', () => ({ getVerifiedSendingDomain: vi.fn().mockResolvedValue(undefined) }))

import { createRegistration } from '@/actions/registrations'
import type { CreateRegistrationInput } from '@/actions/registrations'

const baseInput: CreateRegistrationInput = {
  orgId: 'org-1',
  campId: 'camp-1',
  orgSlug: 'acme',
  campSlug: 'summer-2026',
  campName: 'Summer Camp 2026',
  orgName: 'Acme Org',
  family: {
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    phone: '555-1234',
    address: { street: '', city: '', state: '', zip: '' },
    emergency_contact: { name: '', phone: '', relationship: '' },
  },
  members: [],
}

describe('createRegistration — waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    familySetSpy.mockResolvedValue(undefined)
    memberSetSpy.mockResolvedValue(undefined)
    attachAccessTokenSpy.mockResolvedValue('tok_abc')
    sendEmailSpy.mockResolvedValue(undefined)
  })

  it('sets registration_status pending when no capacity configured', async () => {
    getCampSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'camp-1', capacity: undefined }) })
    getFamiliesSpy.mockResolvedValue({ docs: [] })

    const result = await createRegistration(baseInput)

    const storedFamily = familySetSpy.mock.calls[0][0]
    expect(storedFamily.registration_status).toBe('pending')
    expect(result.waitlisted).toBe(false)
  })

  it('sets registration_status pending when under capacity', async () => {
    getCampSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'camp-1', capacity: 10 }) })
    getFamiliesSpy.mockResolvedValue({
      docs: Array(5).fill(null).map(() => ({ data: () => ({ registration_status: 'confirmed' }) })),
    })

    const result = await createRegistration(baseInput)

    const storedFamily = familySetSpy.mock.calls[0][0]
    expect(storedFamily.registration_status).toBe('pending')
    expect(result.waitlisted).toBe(false)
  })

  it('sets registration_status waitlisted when at capacity', async () => {
    getCampSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'camp-1', capacity: 5 }) })
    getFamiliesSpy.mockResolvedValue({
      docs: Array(5).fill(null).map(() => ({ data: () => ({ registration_status: 'confirmed' }) })),
    })

    const result = await createRegistration(baseInput)

    const storedFamily = familySetSpy.mock.calls[0][0]
    expect(storedFamily.registration_status).toBe('waitlisted')
    expect(result.waitlisted).toBe(true)
  })

  it('counts only pending and confirmed toward capacity (not cancelled or waitlisted)', async () => {
    getCampSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'camp-1', capacity: 3 }) })
    getFamiliesSpy.mockResolvedValue({
      docs: [
        { data: () => ({ registration_status: 'confirmed' }) },
        { data: () => ({ registration_status: 'pending' }) },
        { data: () => ({ registration_status: 'cancelled' }) },   // doesn't count
        { data: () => ({ registration_status: 'waitlisted' }) },  // doesn't count
      ],
    })

    const result = await createRegistration(baseInput)

    const storedFamily = familySetSpy.mock.calls[0][0]
    // 2 active out of capacity 3 → pending (not waitlisted)
    expect(storedFamily.registration_status).toBe('pending')
    expect(result.waitlisted).toBe(false)
  })

  it('skips confirmation email when skipConfirmationEmail is true', async () => {
    getCampSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'camp-1', capacity: undefined }) })
    getFamiliesSpy.mockResolvedValue({ docs: [] })

    await createRegistration({ ...baseInput, skipConfirmationEmail: true })

    expect(sendEmailSpy).not.toHaveBeenCalled()
  })
})
