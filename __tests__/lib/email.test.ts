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
  sendGuardianPickupNotice,
  sendRunSheetEmail,
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

// ── Guardian who-collected notice (inc-2 P3) ────────────────────────────────
describe('sendGuardianPickupNotice', () => {
  beforeEach(() => vi.clearAllMocks())

  const base = {
    to: 'pat@x.co',
    familyFirstName: 'Pat',
    childNames: ['Ann Smith'],
    guardianName: 'Jane Smith (mother)',
    checkedOutAt: '2026-08-23T21:14:00.000Z',
    eventName: 'Summer Camp',
    orgName: 'First Hills',
  }

  it('carries who + when only — child, guardian, stamp, and the reply-to correction path', async () => {
    await sendGuardianPickupNotice({ ...base, replyTo: 'director@x.co' })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.to).toBe('pat@x.co')
    expect(call.replyTo).toBe('director@x.co')
    expect(call.html).toContain('Ann Smith')
    expect(call.html).toContain('Jane Smith (mother)')
    expect(call.html).toContain('2026-08-23 21:14 UTC')
    // The correction path is stated in the copy — no unsend email exists.
    expect(call.html).toMatch(/reply to this email/i)
    // Content contract: never medical, never money.
    expect(call.html).not.toMatch(/allerg|medical|balance|due/i)
  })

  it('escapes an attacker-shaped free-typed guardian name', async () => {
    await sendGuardianPickupNotice({ ...base, guardianName: '<img src=x onerror=alert(1)>' })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.html).not.toContain('<img src=x')
    expect(call.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('uses distinct copy for an unlisted guardian — the send still goes out', async () => {
    await sendGuardianPickupNotice({ ...base, guardianName: 'Randy', unlistedGuardian: true })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.subject).toMatch(/unlisted contact/i)
    expect(call.html).toMatch(/who was not on your listed contacts/i)
  })

  it('lists every sibling in one batch notice', async () => {
    await sendGuardianPickupNotice({ ...base, childNames: ['Ann Smith', 'Bo Smith'] })
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.html).toContain('Ann Smith and Bo Smith')
    expect(call.html).toMatch(/were just collected/i)
  })

  it('degrades to a plain checkout notice when no guardian name was captured', async () => {
    const { guardianName: _g, ...noName } = base
    void _g
    await sendGuardianPickupNotice(noName)
    expect(emailsSendSpy.mock.calls[0][0].html).toMatch(/was just checked out/i)
  })
})

// ── Self-send run sheet (inc-2 S3.3) ────────────────────────────────────────
describe('sendRunSheetEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  const base = {
    to: 'op@demo.co',
    eventName: 'Smith Wedding',
    dateLabel: 'Aug 29, 2026',
    anchor: { label: 'Starts', display: '3:00 PM' },
    backPlan: { packBy: '1:50 PM', leaveBy: '2:40 PM' },
    buffers: { pack_minutes: 50, drive_minutes: 20 },
    venue: { name: 'Basque Center', address: '601 W Grove St' },
    contacts: [{ name: 'Sam', role: 'Coordinator', phone: '208-555-0000' }],
    siteNeeds: ['power', 'water'],
    itinerary: [{ day: 'Aug 29, 2026', items: [{ start_time: '1:30 PM', title: 'Arrive', location: 'Dock' }] }],
    checklists: [{ name: 'Setup', done: 1, total: 3 }],
    loadout: { checked: 4, total: 12 },
    orgSlug: 'demo',
    eventSlug: 'smith-wedding-2026',
  }

  it('inlines the whole sheet — anchor, back-plan with the buffer label, contacts, timeline, load status', async () => {
    await sendRunSheetEmail(base)
    const call = emailsSendSpy.mock.calls[0][0]
    expect(call.to).toBe('op@demo.co')
    expect(call.subject).toBe('Run sheet — Smith Wedding (Aug 29, 2026)')
    const html = call.html as string
    // The content stands alone (dead-zone insurance): every fact is inline.
    expect(html).toContain('3:00 PM')
    expect(html).toContain('Pack by <strong>1:50 PM</strong>')
    expect(html).toContain('assumes 50m pack · 20m drive')
    expect(html).toContain('Basque Center')
    expect(html).toContain('Sam — Coordinator · 208-555-0000')
    expect(html).toContain('power · water')
    expect(html).toContain('Arrive')
    expect(html).toContain('Setup: 1/3 done')
    expect(html).toContain('4 of 12 packed')
    // The live link is allowed but labeled as the stale-escape hatch, not the content.
    expect(html).toContain('/demo/smith-wedding-2026/ops/runsheet')
  })

  it('falls back to the constants label when no org buffers exist', async () => {
    await sendRunSheetEmail({ ...base, buffers: undefined, backPlan: { packBy: '1:45 PM', leaveBy: '2:30 PM' } })
    expect(emailsSendSpy.mock.calls[0][0].html).toContain('assumes 45m pack · 30m drive')
  })

  it('escapes operator-entered content', async () => {
    await sendRunSheetEmail({ ...base, venue: { name: '<script>x</script>' }, contacts: [] })
    const html = emailsSendSpy.mock.calls[0][0].html as string
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
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
    ['sendGuardianPickupNotice', () => sendGuardianPickupNotice({
      to: 'j@e.com', familyFirstName: 'Pat', childNames: ['Ann'],
      checkedOutAt: '2026-08-23T21:14:00.000Z', eventName: 'Camp', orgName: 'Org',
    })],
    ['sendRunSheetEmail', () => sendRunSheetEmail({
      to: 'j@e.com', eventName: 'Job', dateLabel: 'Sat', anchor: null, backPlan: null,
      venue: null, contacts: [], siteNeeds: [], itinerary: [], checklists: [],
      loadout: null, orgSlug: 'o', eventSlug: 'e',
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
