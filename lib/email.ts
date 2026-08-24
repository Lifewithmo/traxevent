import { getResend, buildFromAddress } from '@/lib/resend'
import { bufferAssumptionLabel } from '@/lib/event-ui'

const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://traxevent.com'

/**
 * The Resend SDK does not reject on API failure — a 422 validation error, 403
 * unverified-domain, 429 rate limit, 5xx, or even a dropped connection all RESOLVE
 * as `{ data: null, error }`. Awaiting a send therefore reports success for every
 * failure mode; the only way to know whether delivery happened is to inspect
 * `error`. Every sender in this module routes through here so that a failed send
 * is a thrown error, not silence.
 *
 * Callers decide what a failure means. Where the business action is already
 * committed (a registration written, a proposal signed, a form stored) the send is
 * best-effort and the caller swallows and logs. Where the send IS the action —
 * `sendProposalNudge` — the throw propagates, so nothing downstream records that a
 * message went out when it did not.
 *
 * Exported because `resend.batch.send` resolves the same `{ data, error }`
 * shape — `publishDrop` (actions/drops.ts) reuses this to detect a failed
 * announcement batch instead of stamping `announced_at` on a send that never
 * delivered.
 */
export function assertDelivered(result: { error: { message?: string; name?: string } | null }): void {
  if (result.error) {
    throw new Error(result.error.message ?? result.error.name ?? 'Email delivery failed')
  }
}

interface RegistrationConfirmationParams {
  to: string
  firstName: string
  eventName: string
  orgName: string
  orgSlug: string
  eventSlug: string
  familyId: string
  accessToken: string
  fromDisplayName?: string
  replyTo?: string
  fromDomain?: string
}

export async function sendRegistrationConfirmation(
  params: RegistrationConfirmationParams
): Promise<void> {
  const portalUrl = `https://${params.orgSlug}.traxevent.com/${params.eventSlug}/my-registration?token=${params.accessToken}`
  const accountUrl = `https://${params.orgSlug}.traxevent.com/register/create-account?token=${params.accessToken}&familyId=${params.familyId}`

  const from = buildFromAddress({ displayName: params.fromDisplayName, domain: params.fromDomain })

  assertDelivered(await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject: `Registration confirmed — ${params.eventName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:8px">You're registered!</h1>
        <p style="color:#4C1D95;font-size:16px;margin-bottom:24px">
          Hi ${params.firstName}, your registration for <strong>${params.eventName}</strong>
          at ${params.orgName} has been received.
        </p>
        <a href="${portalUrl}"
           style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600;margin-bottom:24px">
          View my registration
        </a>
        <p style="color:#64748B;font-size:14px;margin-bottom:8px">
          This link works without an account and is valid for 90 days.
        </p>
        <hr style="border:none;border-top:1px solid #DDD6FE;margin:24px 0" />
        <p style="color:#64748B;font-size:13px">
          Want to log in anytime to manage your registrations?
          <a href="${accountUrl}" style="color:#7C3AED">Create a free account</a>
          — it takes 30 seconds and lets you see all your camp registrations in one place.
        </p>
      </div>
    `,
  }))
}

interface FormSignedConfirmationParams {
  to: string
  firstName: string
  formName: string
  eventName: string
  orgName: string
  signedAt: string
  fromDisplayName?: string
  replyTo?: string
  fromDomain?: string
}

export async function sendFormSignedConfirmation(
  params: FormSignedConfirmationParams
): Promise<void> {
  const from = buildFromAddress({ displayName: params.fromDisplayName, domain: params.fromDomain })

  assertDelivered(await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject: `Form signed — ${params.formName} (${params.eventName})`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:8px">Form signed</h1>
        <p style="color:#4C1D95;font-size:16px;margin-bottom:24px">
          Hi ${params.firstName}, your electronic signature has been recorded for
          <strong>${params.formName}</strong> — ${params.eventName} at ${params.orgName}.
        </p>
        <p style="color:#64748B;font-size:13px;margin-bottom:8px">
          Signed: ${new Date(params.signedAt).toLocaleString()}
        </p>
        <p style="color:#64748B;font-size:12px;margin-top:24px">
          This is a record of your electronic signature under the E-SIGN Act.
          Your signature is legally binding.
        </p>
      </div>
    `,
  }))
}

export interface ProposalNudgeParams {
  to: string
  contactName: string
  proposalTitle?: string
  token: string
  fromDisplayName?: string
  fromDomain?: string
  replyTo?: string
}

export async function sendProposalNudge(params: ProposalNudgeParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.fromDisplayName, domain: params.fromDomain })
  const proposalUrl = `${PUBLIC_BASE_URL}/proposals/${params.token}`
  assertDelivered(await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject: 'A reminder about your proposal',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <p style="font-size:16px">Hi ${params.contactName},</p>
        <p style="font-size:16px">
          Just a friendly reminder that your proposal${params.proposalTitle ? ` “${params.proposalTitle}”` : ''}
          is ready for you to review.
        </p>
        <a href="${proposalUrl}"
           style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          View your proposal
        </a>
      </div>
    `,
  }))
}

interface ProposalSignedConfirmationParams {
  to: string
  signerName: string
  token: string
  signedAt: string
  fromDisplayName?: string
  replyTo?: string
  fromDomain?: string
}

// Best-effort confirmation sent to the public signer after `signProposal`
// records their e-signature. Never blocks the sign itself on send failure —
// callers should wrap this in a try/catch.
export async function sendProposalSignedConfirmation(
  params: ProposalSignedConfirmationParams
): Promise<void> {
  const from = buildFromAddress({ displayName: params.fromDisplayName, domain: params.fromDomain })
  const proposalUrl = `${PUBLIC_BASE_URL}/proposals/${params.token}`

  assertDelivered(await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject: 'You signed your proposal',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:8px">You signed your proposal</h1>
        <p style="color:#4C1D95;font-size:16px;margin-bottom:24px">
          Hi ${params.signerName}, your electronic signature has been recorded.
        </p>
        <p style="color:#64748B;font-size:13px;margin-bottom:8px">
          Signed: ${new Date(params.signedAt).toLocaleString()}
        </p>
        <a href="${proposalUrl}"
           style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600;margin-bottom:24px">
          View your proposal
        </a>
        <p style="color:#64748B;font-size:12px;margin-top:24px">
          This is a record of your electronic signature under the E-SIGN Act.
          Your signature is legally binding.
        </p>
      </div>
    `,
  }))
}

// Minimal HTML entity escaping for user-supplied strings interpolated into
// email bodies. The intake form is the first place attacker-controlled text
// flows into these templates — escape everything that isn't server-built.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface IntakeNotificationParams {
  to: string
  orgName: string
  leadName: string
  email: string
  phone?: string
  eventType?: string
  eventDate?: string
  guestCount?: number
  message?: string
  opportunityUrl: string
}

// Best-effort owner notification for a public intake submission. Callers wrap
// this in try/catch — a send failure must never fail the committed lead write.
export async function sendIntakeNotification(params: IntakeNotificationParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.orgName })
  const rows: Array<[string, string]> = [
    ['Name', params.leadName],
    ['Email', params.email],
    ...(params.phone ? ([['Phone', params.phone]] as Array<[string, string]>) : []),
    ...(params.eventType ? ([['Event type', params.eventType]] as Array<[string, string]>) : []),
    ...(params.eventDate ? ([['Event date', params.eventDate]] as Array<[string, string]>) : []),
    ...(params.guestCount != null
      ? ([['Guest count', String(params.guestCount)]] as Array<[string, string]>)
      : []),
    ...(params.message ? ([['Message', params.message]] as Array<[string, string]>) : []),
  ]
  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#64748B;font-size:14px;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>
          <td style="padding:6px 0;color:#1a1a1a;font-size:14px">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('')

  assertDelivered(await getResend().emails.send({
    from,
    to: params.to,
    subject: `New inquiry — ${params.leadName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:8px">New inquiry</h1>
        <p style="color:#4C1D95;font-size:16px;margin-bottom:16px">
          Someone just reached out through your intake form.
        </p>
        <table style="border-collapse:collapse;margin-bottom:24px">${rowsHtml}</table>
        <a href="${params.opportunityUrl}"
           style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          Open in pipeline
        </a>
      </div>
    `,
  }))
}

export interface InvoiceEmailParams {
  to: string
  orgName: string
  invoiceNumber: string
  total: number
  dueDate?: string
  message?: string
  token: string
  isUpdate: boolean
  fromDisplayName?: string
  fromDomain?: string
  replyTo?: string
}

export async function sendInvoiceEmail(params: InvoiceEmailParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.fromDisplayName, domain: params.fromDomain })
  const invoiceUrl = `${PUBLIC_BASE_URL}/invoices/${params.token}`
  const subject = params.isUpdate
    ? `Updated invoice ${params.invoiceNumber} from ${params.orgName}`
    : `Invoice ${params.invoiceNumber} from ${params.orgName}`

  assertDelivered(await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1a1a1a;font-size:20px;margin-bottom:8px">Invoice ${escapeHtml(params.invoiceNumber)}</h1>
        <p style="color:#1a1a1a;font-size:16px;margin-bottom:8px">
          ${escapeHtml(params.orgName)} sent you an invoice for <strong>$${params.total.toFixed(2)}</strong>${params.dueDate ? `, due ${escapeHtml(params.dueDate)}` : ''}.
        </p>
        ${params.message ? `<p style="color:#4b5563;font-size:15px;margin-bottom:16px">${escapeHtml(params.message)}</p>` : ''}
        <a href="${invoiceUrl}"
           style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          View invoice
        </a>
      </div>
    `,
  }))
}

export interface OrderConfirmationParams {
  to: string
  buyerName: string
  orgDisplayName: string
  dropTitle: string
  orderNumber: number
  pickupLabel: string
  lines: Array<{ name: string; qty: number; price: number }>
  total: number
  orderUrl: string
  fromDomain?: string
}

// Best-effort order receipt — the webhook wraps this in try/catch; a send
// failure must never fail the confirmed order write.
export async function sendOrderConfirmation(params: OrderConfirmationParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.orgDisplayName, domain: params.fromDomain })
  const rowsHtml = params.lines
    .map(
      (l) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#1a1a1a;font-size:14px">${l.qty} × ${escapeHtml(l.name)}</td>
          <td style="padding:6px 0;color:#64748B;font-size:14px;text-align:right">$${(l.price * l.qty).toFixed(2)}</td>
        </tr>`
    )
    .join('')

  assertDelivered(await getResend().emails.send({
    from,
    to: params.to,
    subject: `Order #${params.orderNumber} confirmed — ${params.dropTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1a1a1a;margin-bottom:8px">You're all set, ${escapeHtml(params.buyerName)}</h1>
        <p style="color:#4b5563;font-size:16px;margin-bottom:4px">Pickup number <strong>#${params.orderNumber}</strong></p>
        <p style="color:#4b5563;font-size:14px;margin-bottom:16px">${escapeHtml(params.pickupLabel)}</p>
        <table style="border-collapse:collapse;width:100%;margin-bottom:8px">${rowsHtml}</table>
        <p style="color:#1a1a1a;font-size:16px;font-weight:600;margin-bottom:24px">Total $${params.total.toFixed(2)}</p>
        <a href="${params.orderUrl}"
           style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          View your order
        </a>
      </div>
    `,
  }))
}

export interface GuardianPickupNoticeParams {
  to: string
  /** Family (registering parent) first name for the greeting. */
  familyFirstName: string
  /** The checked-out children's names, one email per family (P3). */
  childNames: string[]
  /** Free-typed or quick-picked guardian name; undefined = no name captured. */
  guardianName?: string
  /** The guardian was NOT one of the family's listed contacts — distinct copy (P3). */
  unlistedGuardian?: boolean
  /** ISO timestamp of the checkout. */
  checkedOutAt: string
  eventName: string
  orgName: string
  fromDisplayName?: string
  replyTo?: string
  fromDomain?: string
}

/**
 * Guardian who-collected email (inc-2 P3) — the highest-trust send in the
 * product, so its content contract is strict:
 *   - who + when ONLY: no medical flags, no balance, no links to gated pages;
 *   - the free-typed guardian name is attacker-shaped input → escapeHtml;
 *   - an unlisted guardian STILL sends, with copy that says so plainly —
 *     that is exactly the pickup a parent most wants to hear about;
 *   - no unsend/correction email exists: the copy names reply-to-this-email
 *     as the correction path.
 * Best-effort by contract: callers send POST-transaction and swallow failures
 * (the custody record is already committed; a send failure must never fail or
 * retry the checkout).
 */
export async function sendGuardianPickupNotice(params: GuardianPickupNoticeParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.fromDisplayName, domain: params.fromDomain })
  const names = params.childNames.map((n) => escapeHtml(n))
  const children =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const verb = names.length === 1 ? 'was' : 'were'

  // Server-rendered timestamp: UTC-labeled fine print (ops/print precedent) —
  // no timezone field exists anywhere, so a bare local-looking time would lie.
  // The headline carries the honest "just now": this email sends at checkout.
  const d = new Date(params.checkedOutAt)
  const stamp = Number.isNaN(d.getTime())
    ? params.checkedOutAt
    : `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`

  const collectedBy = params.guardianName
    ? params.unlistedGuardian
      ? `${children} ${verb} just collected by <strong>${escapeHtml(params.guardianName)}</strong>, who was not on your listed contacts.`
      : `${children} ${verb} just collected by <strong>${escapeHtml(params.guardianName)}</strong>.`
    : `${children} ${verb} just checked out.`

  const subject = params.unlistedGuardian
    ? `Pickup by an unlisted contact — ${params.eventName}`
    : `Picked up — ${params.eventName}`

  assertDelivered(await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1a1a1a;font-size:20px;margin-bottom:8px">${params.unlistedGuardian ? 'Pickup by an unlisted contact' : 'Picked up'}</h1>
        <p style="color:#1a1a1a;font-size:16px;margin-bottom:8px">
          Hi ${escapeHtml(params.familyFirstName)}, ${collectedBy}
        </p>
        <p style="color:#64748B;font-size:13px;margin-bottom:16px">
          ${escapeHtml(params.eventName)} at ${escapeHtml(params.orgName)} · ${escapeHtml(stamp)}
        </p>
        <p style="color:#64748B;font-size:13px">
          If this doesn&rsquo;t look right, reply to this email and ${escapeHtml(params.orgName)} will follow up.
        </p>
      </div>
    `,
  }))
}

export interface RunSheetEmailParams {
  to: string
  eventName: string
  dateLabel: string
  anchor: { label: string; display: string } | null
  backPlan: { packBy: string; leaveBy: string } | null
  buffers?: { pack_minutes?: number; drive_minutes?: number }
  venue: { name: string; address?: string } | null
  contacts: Array<{ name: string; role: string; phone?: string; email?: string }>
  siteNeeds: string[]
  itinerary: Array<{ day: string; items: Array<{ start_time: string; title: string; location?: string }> }>
  checklists: Array<{ name: string; done: number; total: number }>
  loadout: { checked: number; total: number } | null
  orgSlug: string
  eventSlug: string
  fromDisplayName?: string
  fromDomain?: string
}

/**
 * Self-send run sheet (inc-2 S3.3): the CONTENT IS INLINE — timeline, contacts,
 * site needs, load status, anchor + back-plan — because the admin surface sits
 * behind the auth wall; the live link is included but the email must stand
 * alone in a dead zone. Sending IS the action: a rejected send throws
 * (assertDelivered), the caller must not log or report "sent" past a throw.
 */
export async function sendRunSheetEmail(params: RunSheetEmailParams): Promise<void> {
  const from = buildFromAddress({ displayName: params.fromDisplayName, domain: params.fromDomain })
  const liveUrl = `${PUBLIC_BASE_URL}/${params.orgSlug}/${params.eventSlug}/ops/runsheet`

  // SHARED label (lib/event-ui): the caption must come from the same
  // resolveBuffers math that produced the caller's backPlan — never a local
  // re-derivation whose fallbacks/semantics could silently drift from the
  // emailed Pack-by/Leave-by times ("the label can never disagree with the
  // math", lib/ops/anchor.ts).
  const bufferLabel = bufferAssumptionLabel(params.buffers)

  const section = (title: string, body: string) => `
    <h2 style="color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:20px 0 4px">${title}</h2>
    ${body}`

  const contactsHtml = params.contacts.length > 0
    ? `<ul style="margin:0;padding-left:16px;color:#1a1a1a;font-size:14px">${params.contacts
        .map((c) =>
          `<li>${escapeHtml(c.name)}${c.role ? ` — ${escapeHtml(c.role)}` : ''}${c.phone ? ` · ${escapeHtml(c.phone)}` : ''}${c.email ? ` · ${escapeHtml(c.email)}` : ''}</li>`)
        .join('')}</ul>`
    : '<p style="color:#64748B;font-size:14px;margin:0">None on file.</p>'

  const timelineHtml = params.itinerary.length > 0
    ? params.itinerary
        .map((day) => `
          ${params.itinerary.length > 1 ? `<p style="color:#1a1a1a;font-size:14px;font-weight:600;margin:8px 0 2px">${escapeHtml(day.day)}</p>` : ''}
          <ul style="margin:0;padding-left:16px;color:#1a1a1a;font-size:14px">${day.items
            .map((i) => `<li><strong>${escapeHtml(i.start_time)}</strong> ${escapeHtml(i.title)}${i.location ? ` · ${escapeHtml(i.location)}` : ''}</li>`)
            .join('')}</ul>`)
        .join('')
    : '<p style="color:#64748B;font-size:14px;margin:0">No schedule entered.</p>'

  const checklistsHtml = params.checklists.length > 0
    ? `<ul style="margin:0;padding-left:16px;color:#1a1a1a;font-size:14px">${params.checklists
        .map((c) => `<li>${escapeHtml(c.name)}: ${c.done}/${c.total} done</li>`)
        .join('')}</ul>`
    : '<p style="color:#64748B;font-size:14px;margin:0">No day-of checklists.</p>'

  assertDelivered(await getResend().emails.send({
    from,
    to: params.to,
    subject: `Run sheet — ${params.eventName} (${params.dateLabel})`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1a1a1a;font-size:20px;margin-bottom:2px">${escapeHtml(params.eventName)}</h1>
        <p style="color:#64748B;font-size:14px;margin:0 0 12px">${escapeHtml(params.dateLabel)}</p>
        <p style="color:#1a1a1a;font-size:24px;font-weight:700;margin:0">
          ${params.anchor ? `<span style="color:#64748B;font-size:13px;font-weight:500">${escapeHtml(params.anchor.label)}</span> ${escapeHtml(params.anchor.display)}` : 'Time TBD'}
        </p>
        ${params.backPlan ? `<p style="color:#1a1a1a;font-size:14px;margin:4px 0 0">Pack by <strong>${escapeHtml(params.backPlan.packBy)}</strong> · Leave by <strong>${escapeHtml(params.backPlan.leaveBy)}</strong> <span style="color:#64748B">(${escapeHtml(bufferLabel)})</span></p>` : ''}
        ${params.venue ? `<p style="color:#1a1a1a;font-size:14px;margin:4px 0 0">${escapeHtml(params.venue.name)}${params.venue.address ? ` · ${escapeHtml(params.venue.address)}` : ''}</p>` : ''}
        ${section('Contacts', contactsHtml)}
        ${section('Site needs', params.siteNeeds.length > 0 ? `<p style="color:#1a1a1a;font-size:14px;margin:0">${params.siteNeeds.map(escapeHtml).join(' · ')}</p>` : '<p style="color:#64748B;font-size:14px;margin:0">None recorded.</p>')}
        ${section('Timeline', timelineHtml)}
        ${section('Checklists', checklistsHtml)}
        ${section('Load-out', params.loadout && params.loadout.total > 0 ? `<p style="color:#1a1a1a;font-size:14px;margin:0">${params.loadout.checked} of ${params.loadout.total} packed</p>` : '<p style="color:#64748B;font-size:14px;margin:0">No load list.</p>')}
        <p style="margin-top:24px;font-size:12px;color:#9ca3af">
          Live sheet (this email goes stale): <a href="${liveUrl}" style="color:#9ca3af">${liveUrl}</a>
        </p>
      </div>
    `,
  }))
}

export interface DropAnnouncementParams {
  to: string
  orgDisplayName: string
  dropTitle: string
  opensLabel: string
  dropUrl: string
  unsubscribeUrl: string
  fromDomain?: string
}

// Returns a resend.batch.send payload — publishDrop batches these in chunks
// of 100 (actions/communicate.ts pattern). No send call here, so the
// delivery-failure detection used by the other senders in this module does
// not apply — the caller is responsible for inspecting the batch response.
export function buildDropAnnouncementEmail(params: DropAnnouncementParams): {
  from: string; to: string; subject: string; html: string
} {
  const from = buildFromAddress({ displayName: params.orgDisplayName, domain: params.fromDomain })
  return {
    from,
    to: params.to,
    subject: `${params.dropTitle} — orders open ${params.opensLabel}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#1a1a1a;margin-bottom:8px">${escapeHtml(params.dropTitle)}</h1>
        <p style="color:#4b5563;font-size:16px;margin-bottom:24px">
          ${escapeHtml(params.orgDisplayName)} just scheduled a new drop. Orders open ${escapeHtml(params.opensLabel)}.
        </p>
        <a href="${params.dropUrl}"
           style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600">
          See the menu
        </a>
        <p style="margin-top:32px;font-size:12px;color:#9ca3af">
          <a href="${params.unsubscribeUrl}" style="color:#9ca3af">Unsubscribe</a> from drop reminders.
        </p>
      </div>
    `,
  }
}
