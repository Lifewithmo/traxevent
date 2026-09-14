// Shared lead-field validation — ONE rule set for every door a lead comes
// through. The public intake form (actions/intake-public) and the operator's
// New-opportunity path (actions/leads + the form's client-side pass) all call
// this, so the operator path can never accept less than the public path does.
//
// Pure and client-safe by design: no 'use server', no I/O, no Date.now(). The
// form calls it synchronously on submit for instant per-field errors; the
// server actions call the same function as the authority.
//
// The messages are byte-for-byte the strings intake has always thrown —
// sharing the rules must not change what a public submitter sees.

export interface LeadFieldErrors {
  name?: string
  email?: string
  phone?: string
  event_type?: string
  event_date?: string
  guest_count?: string
  estimated_value?: string
  notes?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Format only — a past date is deliberately NOT an error here. The client
// renders a warning for it (the operator may be back-logging a real inquiry),
// and the calendar's verdict layer owns tense, not the validator.
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Empty object = valid. Messages are operator-readable sentences.
 *
 * Errors are inserted in the historical intake throw order (name, email,
 * phone, event_type, notes, event_date, guest_count, then the operator-only
 * estimated_value) so `firstLeadFieldError` reproduces exactly what
 * `submitIntake` used to throw when several fields are bad at once.
 */
export function validateLeadFields(
  fields: {
    name?: string
    email?: string
    phone?: string
    event_type?: string
    event_date?: string
    guest_count?: number
    estimated_value?: number
    notes?: string
  },
  opts?: { requireName?: boolean; requireEmail?: boolean }
): LeadFieldErrors {
  const name = (fields.name ?? '').trim()
  const email = (fields.email ?? '').trim()
  const phone = (fields.phone ?? '').trim()
  const eventType = (fields.event_type ?? '').trim()
  const eventDate = (fields.event_date ?? '').trim()
  const notes = (fields.notes ?? '').trim()
  const guestCount = fields.guest_count
  const estimatedValue = fields.estimated_value

  const errors: LeadFieldErrors = {}
  if ((opts?.requireName && !name) || name.length > 200) {
    errors.name = 'Please enter your name.'
  }
  if ((opts?.requireEmail && !email) || (email && (email.length > 200 || !EMAIL_RE.test(email)))) {
    errors.email = 'Please enter a valid email address.'
  }
  if (phone.length > 200) errors.phone = 'That submission looks too long.'
  if (eventType.length > 200) errors.event_type = 'That submission looks too long.'
  if (notes.length > 2000) errors.notes = 'Please keep your message under 2000 characters.'
  if (eventDate && !YMD_RE.test(eventDate)) {
    errors.event_date = 'Please pick a valid event date.'
  }
  if (
    guestCount != null &&
    (!Number.isInteger(guestCount) || guestCount < 0 || guestCount > 100000)
  ) {
    errors.guest_count = 'Please enter a valid guest count.'
  }
  if (
    estimatedValue != null &&
    (!Number.isFinite(estimatedValue) || estimatedValue < 0 || estimatedValue > 100_000_000)
  ) {
    errors.estimated_value = 'Please enter a valid estimated value.'
  }
  return errors
}

/** The message a server action throws: the first error in insertion order
 *  (which `validateLeadFields` guarantees is the historical intake order). */
export function firstLeadFieldError(errors: LeadFieldErrors): string | undefined {
  return Object.values(errors)[0]
}
