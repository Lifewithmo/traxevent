import { describe, it, expect, vi, beforeEach } from 'vitest'

const emailsSendSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }))

vi.mock('@/lib/resend', () => ({
  FROM_EMAIL: 'noreply@traxevent.com',
  getResend: vi.fn().mockReturnValue({
    emails: { send: emailsSendSpy },
  }),
  buildFromAddress: (opts: { displayName?: string; domain?: string }) => {
    const email = opts.domain ? `noreply@${opts.domain}` : 'noreply@traxevent.com'
    return opts.displayName ? `"${opts.displayName}" <${email}>` : email
  },
}))

import {
  sendRegistrationConfirmation,
  sendFormSignedConfirmation,
  sendProposalNudge,
  sendProposalSignedConfirmation,
  sendIntakeNotification,
  sendInvoiceEmail,
  sendOrderConfirmation,
  buildDropAnnouncementEmail,
  escapeHtml,
} from '@/lib/email'

const baseParams = {
  to: 'jane@example.com',
  firstName: 'Jane',
  eventName: 'Summer Camp 2026',
  orgName: 'First Hills Fellowship',
  orgSlug: 'firsthills',
  eventSlug: 'summer-2026',
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

describe('sendProposalNudge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends a reminder linking to the proposal portal', async () => {
    await sendProposalNudge({
      to: 'dana@example.com',
      contactName: 'Dana',
      proposalTitle: 'Fall retreat catering',
      token: 'tok_nudge',
    })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.to).toBe('dana@example.com')
    expect(call.subject).toBe('A reminder about your proposal')
    expect(call.html).toContain('/proposals/tok_nudge')
  })

  it('uses branding params for from and replyTo', async () => {
    await sendProposalNudge({
      to: 'dana@example.com',
      contactName: 'Dana',
      token: 'tok_nudge',
      fromDisplayName: 'BrewTrax Events',
      fromDomain: 'brewtrax.com',
      replyTo: 'owner@brewtrax.com',
    })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.from).toBe('"BrewTrax Events" <noreply@brewtrax.com>')
    expect(call.replyTo).toBe('owner@brewtrax.com')
  })
})

describe('escapeHtml', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<img src=x onerror="alert('&')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;&amp;&#39;)&quot;&gt;'
    )
  })
  it('passes plain text through', () => {
    expect(escapeHtml('Ada Lovelace')).toBe('Ada Lovelace')
  })
})

describe('sendIntakeNotification', () => {
  beforeEach(() => vi.clearAllMocks())

  const base = {
    to: 'owner@example.com',
    orgName: 'Brew Cart Co',
    leadName: 'Ada Lovelace',
    email: 'ada@example.com',
    opportunityUrl: 'https://traxevent.com/brewcart/leads/abc123',
  }

  it('sends to the owner with org display name and the opportunity link', async () => {
    await sendIntakeNotification(base)
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.to).toBe('owner@example.com')
    expect(call.from).toBe('"Brew Cart Co" <noreply@traxevent.com>')
    expect(call.subject).toBe('New inquiry — Ada Lovelace')
    expect(call.html).toContain('https://traxevent.com/brewcart/leads/abc123')
    expect(call.html).toContain('ada@example.com')
  })

  it('escapes attacker-supplied values in the HTML body', async () => {
    await sendIntakeNotification({
      ...base,
      leadName: '<script>alert(1)</script>',
      message: '<b>bold</b> & "quoted"',
    })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(call.html).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;')
  })

  it('omits rows for absent optional fields', async () => {
    await sendIntakeNotification(base)
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.html).not.toContain('Phone')
    expect(call.html).not.toContain('Message')
  })
})

describe('sendInvoiceEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the invoice link with escaped user content and reply-to', async () => {
    await sendInvoiceEmail({
      to: 'client@example.com', orgName: 'BrewTrax', invoiceNumber: 'BRW-1042',
      total: 1100, dueDate: '2026-09-01', message: 'Thanks <3', token: 'tok123',
      isUpdate: false, fromDisplayName: 'BrewTrax', replyTo: 'ryan@example.com',
    })
    const call = emailsSendSpy.mock.calls.at(-1)![0]
    expect(call.to).toBe('client@example.com')
    expect(call.replyTo).toBe('ryan@example.com')
    expect(call.subject).toContain('BRW-1042')
    expect(call.html).toContain('/invoices/tok123')
    expect(call.html).toContain('$1100.00')
    expect(call.html).toContain('Thanks &lt;3')   // user message is escaped
    expect(call.html).not.toContain('Thanks <3')
  })

  it('marks updates in the subject', async () => {
    await sendInvoiceEmail({
      to: 'c@e.com', orgName: 'BrewTrax', invoiceNumber: '1042', total: 5,
      token: 't', isUpdate: true,
    })
    expect(emailsSendSpy.mock.calls.at(-1)![0].subject).toMatch(/updated/i)
  })

  // The Resend SDK RESOLVES on API failure ({ data: null, error }) rather than
  // rejecting — 422, 403, 429, 5xx and dropped connections all land here. Without
  // an explicit check the caller reports a delivered email that never went out,
  // which silently defeats sendInvoice's delivery-failure branch.
  it('throws when Resend resolves with an error instead of delivering', async () => {
    emailsSendSpy.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid `to` field.' },
    })
    await expect(
      sendInvoiceEmail({
        to: 'bogus', orgName: 'BrewTrax', invoiceNumber: '1042', total: 5, token: 't', isUpdate: false,
      }),
    ).rejects.toThrow(/invalid `to` field/i)
  })

  it('falls back to the error name when Resend supplies no message', async () => {
    emailsSendSpy.mockResolvedValueOnce({ data: null, error: { name: 'application_error' } })
    await expect(
      sendInvoiceEmail({
        to: 'c@e.com', orgName: 'BrewTrax', invoiceNumber: '1042', total: 5, token: 't', isUpdate: false,
      }),
    ).rejects.toThrow(/application_error/)
  })
})

describe('sendOrderConfirmation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends from the org display name, includes pickup number/lines/total, links the status page, escapes HTML', async () => {
    await sendOrderConfirmation({
      to: 'jane@example.com',
      buyerName: 'Jane <script>',
      orgDisplayName: 'Love & Co',
      dropTitle: 'Weekend Drop',
      orderNumber: 8,
      pickupLabel: 'Sat, Aug 22 · 08:00–11:00 · SW Boise',
      lines: [{ name: 'Vanilla <b>Latte</b>', qty: 2, price: 5.5 }],
      total: 11,
      orderUrl: 'https://traxevent.com/orders/tok123',
    })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.to).toBe('jane@example.com')
    expect(call.from).toBe('"Love & Co" <noreply@traxevent.com>')
    expect(call.subject).toContain('#8')
    expect(call.html).toContain('https://traxevent.com/orders/tok123')
    expect(call.html).toContain('Vanilla &lt;b&gt;Latte&lt;/b&gt;')
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('$11.00')
  })

  // Same delivery-failure detection as every other sender in this module — the
  // Resend SDK resolves (not rejects) on a 422/403/429/5xx, so sendOrderConfirmation
  // must route through assertDelivered like its siblings.
  it('throws when Resend resolves with an error instead of delivering', async () => {
    emailsSendSpy.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid `to` field.' },
    })
    await expect(
      sendOrderConfirmation({
        to: 'bogus', buyerName: 'Jane', orgDisplayName: 'Love & Co', dropTitle: 'Weekend Drop',
        orderNumber: 8, pickupLabel: 'Sat', lines: [], total: 0, orderUrl: 'https://traxevent.com/orders/t',
      }),
    ).rejects.toThrow(/invalid `to` field/i)
  })
})

describe('buildDropAnnouncementEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a batchable payload with drop + unsubscribe links', () => {
    const p = buildDropAnnouncementEmail({
      to: 'fan@example.com',
      orgDisplayName: 'Love Brew',
      dropTitle: 'Weekend Drop',
      opensLabel: 'Sat, Aug 22 at 8:00 AM',
      dropUrl: 'https://traxevent.com/p/lovebrew/drops/d1',
      unsubscribeUrl: 'https://traxevent.com/unsubscribe/tok456',
    })
    expect(p.to).toBe('fan@example.com')
    expect(p.subject).toContain('Weekend Drop')
    expect(p.html).toContain('https://traxevent.com/p/lovebrew/drops/d1')
    expect(p.html).toContain('https://traxevent.com/unsubscribe/tok456')
  })

  it('does not call the Resend send API — it only builds a payload for batch.send', () => {
    buildDropAnnouncementEmail({
      to: 'fan@example.com',
      orgDisplayName: 'Love Brew',
      dropTitle: 'Weekend Drop',
      opensLabel: 'Sat, Aug 22 at 8:00 AM',
      dropUrl: 'https://traxevent.com/p/lovebrew/drops/d1',
      unsubscribeUrl: 'https://traxevent.com/unsubscribe/tok456',
    })
    expect(emailsSendSpy).not.toHaveBeenCalled()
  })
})

// Every sender in this module must detect a resolved-with-error send, not just the
// invoice one. The Resend SDK resolves on 422/403/429/5xx and on a dropped connection,
// so a sender that ignores `error` reports success for a mail that never left.
describe('delivery detection across every sender', () => {
  // mockReset, not clearAllMocks: clearing wipes call history but leaves queued
  // mockResolvedValueOnce implementations, so a case that throws before reaching
  // send() would leak its queued error into the next test.
  beforeEach(() => {
    emailsSendSpy.mockReset()
    emailsSendSpy.mockResolvedValue({ data: { id: 'email-1' }, error: null })
  })

  const resendError = { data: null, error: { name: 'validation_error', message: 'Invalid `to` field.' } }

  const senders: Array<[string, () => Promise<void>]> = [
    ['sendRegistrationConfirmation', () => sendRegistrationConfirmation(baseParams)],
    ['sendFormSignedConfirmation', () => sendFormSignedConfirmation({
      to: 'j@e.com', firstName: 'Jane', formName: 'Waiver', eventName: 'Camp',
      orgName: 'Org', signedAt: '2026-08-01T00:00:00.000Z',
    })],
    ['sendProposalNudge', () => sendProposalNudge({ to: 'j@e.com', contactName: 'Jane', token: 't' })],
    ['sendProposalSignedConfirmation', () => sendProposalSignedConfirmation({
      to: 'j@e.com', signerName: 'Jane', token: 't', signedAt: '2026-08-01T00:00:00.000Z',
    })],
    ['sendIntakeNotification', () => sendIntakeNotification({
      to: 'ops@e.com', orgName: 'Org', leadName: 'Jane', email: 'j@e.com',
      opportunityUrl: 'https://traxevent.com/org/leads/l1',
    })],
    ['sendInvoiceEmail', () => sendInvoiceEmail({
      to: 'j@e.com', orgName: 'Org', invoiceNumber: '1', total: 1, token: 't', isUpdate: false,
    })],
    ['sendOrderConfirmation', () => sendOrderConfirmation({
      to: 'j@e.com', buyerName: 'Jane', orgDisplayName: 'Org', dropTitle: 'Drop',
      orderNumber: 1, pickupLabel: 'Sat', lines: [], total: 0, orderUrl: 'https://traxevent.com/orders/t',
    })],
  ]

  it.each(senders)('%s throws when Resend resolves with an error', async (_name, send) => {
    emailsSendSpy.mockResolvedValueOnce(resendError)
    await expect(send()).rejects.toThrow(/invalid `to` field/i)
  })

  it.each(senders)('%s resolves normally on a successful send', async (_name, send) => {
    emailsSendSpy.mockResolvedValueOnce({ data: { id: 'email-1' }, error: null })
    await expect(send()).resolves.toBeUndefined()
  })
})
