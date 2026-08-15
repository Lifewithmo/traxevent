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

import { sendRegistrationConfirmation, sendProposalNudge, sendIntakeNotification, sendInvoiceEmail, escapeHtml } from '@/lib/email'

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
})
