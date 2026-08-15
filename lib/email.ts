import { getResend, buildFromAddress } from '@/lib/resend'

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
 */
function assertDelivered(result: { error: { message?: string; name?: string } | null }): void {
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
