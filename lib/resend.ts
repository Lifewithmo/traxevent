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
export function buildFromAddress(opts: { displayName?: string; domain?: string; senderEmail?: string }): string {
  // senderEmail (a full address on a verified domain) wins; else noreply@<domain>; else platform default.
  const email = opts.senderEmail ?? (opts.domain ? `noreply@${opts.domain}` : FROM_EMAIL)
  if (!opts.displayName) return email
  // Escape backslashes and double-quotes for a valid RFC 5322 quoted-string
  const escaped = opts.displayName.replace(/([\\"])/g, '\\$1')
  return `"${escaped}" <${email}>`
}

// Sanitize a name or email into a safe email local part: lowercase, ASCII-folded,
// non-alphanumerics collapsed to dots. "John Smith" -> "john.smith".
export function deriveLocalPart(nameOrEmail: string): string {
  const base = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail
  return base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/['’]/g, '') // drop straight + curly apostrophes (don't become dots)
    .replace(/[^a-z0-9]+/g, '.') // everything else -> dot
    .replace(/^\.+|\.+$/g, '') // trim leading/trailing dots
}

// Compose a sender address on a verified domain, or undefined if either input is missing.
export function resolveSenderEmail(opts: { verifiedDomain?: string; localPart: string }): string | undefined {
  if (!opts.verifiedDomain || !opts.localPart) return undefined
  return `${opts.localPart}@${opts.verifiedDomain}`
}
