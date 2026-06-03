import { getResend, FROM_EMAIL } from '@/lib/resend'

interface RegistrationConfirmationParams {
  to: string
  firstName: string
  campName: string
  orgName: string
  orgSlug: string
  campSlug: string
  familyId: string
  accessToken: string
  fromDisplayName?: string
  replyTo?: string
}

export async function sendRegistrationConfirmation(
  params: RegistrationConfirmationParams
): Promise<void> {
  const portalUrl = `https://${params.orgSlug}.traxevent.com/${params.campSlug}/my-registration?token=${params.accessToken}`
  const accountUrl = `https://${params.orgSlug}.traxevent.com/register/create-account?token=${params.accessToken}&familyId=${params.familyId}`

  const from = params.fromDisplayName
    ? `"${params.fromDisplayName}" <${FROM_EMAIL}>`
    : FROM_EMAIL

  await getResend().emails.send({
    from,
    to: params.to,
    ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    subject: `Registration confirmed — ${params.campName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#7C3AED;margin-bottom:8px">You're registered!</h1>
        <p style="color:#4C1D95;font-size:16px;margin-bottom:24px">
          Hi ${params.firstName}, your registration for <strong>${params.campName}</strong>
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
  })
}
