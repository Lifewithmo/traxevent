import { describe, it, expect, vi, beforeEach } from 'vitest'

const batchSendSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ data: [], error: null }))
const logSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const getCampSpy = vi.hoisted(() => vi.fn())
const getFamiliesSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/resend', () => ({
  FROM_EMAIL: 'noreply@traxevent.com',
  getResend: vi.fn().mockReturnValue({
    batch: { send: batchSendSpy },
  }),
}))

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
                      if (sub2 === 'families') return { get: getFamiliesSpy }
                      if (sub2 === 'communication_log') {
                        return { doc: vi.fn().mockReturnValue({ set: logSetSpy }) }
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

import { sendEmailBlast } from '@/actions/communicate'

const mockCamp = {
  id: 'camp-1',
  name: 'Summer Camp 2026',
  from_display_name: 'Summer Camp at First Hills',
  reply_to_email: 'director@firsthills.org',
}

const makeFamily = (status: string, email: string) => ({
  data: () => ({ id: `fam-${email}`, first_name: 'Jane', last_name: 'Smith', email, registration_status: status }),
})

describe('sendEmailBlast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCampSpy.mockResolvedValue({ exists: true, data: () => mockCamp })
  })

  it('sends to all non-cancelled families when filter is "all"', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        makeFamily('confirmed', 'a@test.com'),
        makeFamily('pending', 'b@test.com'),
        makeFamily('waitlisted', 'c@test.com'),
        makeFamily('cancelled', 'd@test.com'),
      ],
    })

    const result = await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Camp Update',
      htmlBody: '<p>Hello</p>',
      filter: 'all',
    })

    expect(result.sent).toBe(3)
    expect(batchSendSpy).toHaveBeenCalledTimes(1)
    const emails = batchSendSpy.mock.calls[0][0]
    expect(emails).toHaveLength(3)
    expect(emails[0].to).toBe('a@test.com')
    expect(emails[0].from).toBe('"Summer Camp at First Hills" <noreply@traxevent.com>')
    expect(emails[0].replyTo).toBe('director@firsthills.org')
  })

  it('filters to only confirmed families when filter is "confirmed"', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        makeFamily('confirmed', 'a@test.com'),
        makeFamily('pending', 'b@test.com'),
        makeFamily('waitlisted', 'c@test.com'),
      ],
    })

    const result = await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Confirmed Only',
      htmlBody: '<p>Hi!</p>',
      filter: 'confirmed',
    })

    expect(result.sent).toBe(1)
    expect(batchSendSpy.mock.calls[0][0][0].to).toBe('a@test.com')
  })

  it('writes a communication log entry after sending', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [makeFamily('confirmed', 'a@test.com')],
    })

    await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Test Subject',
      htmlBody: '<p>Body</p>',
      filter: 'all',
    })

    expect(logSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Test Subject',
        html_body: '<p>Body</p>',
        filter: 'all',
        recipient_count: 1,
        sent_at: expect.any(String),
      })
    )
  })

  it('chunks into batches of 100 for large recipient lists', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: Array.from({ length: 150 }, (_, i) =>
        makeFamily('confirmed', `user${i}@test.com`)
      ),
    })

    const result = await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Big Blast',
      htmlBody: '<p>Hi</p>',
      filter: 'all',
    })

    expect(result.sent).toBe(150)
    expect(batchSendSpy).toHaveBeenCalledTimes(2)
  })

  it('returns sent: 0 and does not call batch when no matching families', async () => {
    getFamiliesSpy.mockResolvedValue({ docs: [] })

    const result = await sendEmailBlast('org-1', 'camp-1', {
      subject: 'Empty',
      htmlBody: '<p>Nobody</p>',
      filter: 'all',
    })

    expect(result.sent).toBe(0)
    expect(batchSendSpy).not.toHaveBeenCalled()
  })
})
