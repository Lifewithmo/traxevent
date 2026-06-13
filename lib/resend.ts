import { Resend } from 'resend'

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'noreply@traxevent.com'

export function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set')
  }
  return new Resend(process.env.RESEND_API_KEY)
}

// Builds the email "from" header. When a verified custom domain is supplied,
// mail is sent from noreply@<domain>; otherwise the platform default is used.
export function buildFromAddress(opts: { displayName?: string; domain?: string }): string {
  const email = opts.domain ? `noreply@${opts.domain}` : FROM_EMAIL
  if (!opts.displayName) return email
  // Escape backslashes and double-quotes for a valid RFC 5322 quoted-string
  const escaped = opts.displayName.replace(/([\\"])/g, '\\$1')
  return `"${escaped}" <${email}>`
}
