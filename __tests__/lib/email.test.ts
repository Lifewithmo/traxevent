import { describe, it, expect, vi, beforeEach } from 'vitest'

const emailsSendSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }))

vi.mock('@/lib/resend', () => ({
  FROM_EMAIL: 'noreply@traxevent.com',
  getResend: vi.fn().mockReturnValue({
    emails: { send: emailsSendSpy },
  }),
}))

import { sendRegistrationConfirmation } from '@/lib/email'

const baseParams = {
  to: 'jane@example.com',
  firstName: 'Jane',
  campName: 'Summer Camp 2026',
  orgName: 'First Hills Fellowship',
  orgSlug: 'firsthills',
  campSlug: 'summer-2026',
  familyId: 'fam-1',
  accessToken: 'tok_abc',
}

describe('sendRegistrationConfirmation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends with default from when no fromDisplayName', async () => {
    await sendRegistrationConfirmation(baseParams)
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.from).toBe('noreply@traxevent.com')
    expect(call.replyTo).toBeUndefined()
  })

  it('uses fromDisplayName in the from field', async () => {
    await sendRegistrationConfirmation({
      ...baseParams,
      fromDisplayName: 'Summer Camp 2026 at First Hills',
    })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.from).toBe('"Summer Camp 2026 at First Hills" <noreply@traxevent.com>')
  })

  it('sets replyTo when replyTo is provided', async () => {
    await sendRegistrationConfirmation({
      ...baseParams,
      replyTo: 'director@firsthills.org',
    })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.replyTo).toBe('director@firsthills.org')
  })

  it('sends to the correct recipient', async () => {
    await sendRegistrationConfirmation(baseParams)
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.to).toBe('jane@example.com')
  })
})
