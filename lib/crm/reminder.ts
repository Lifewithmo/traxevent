import type { Invoice } from '@/lib/types'
import { invoiceBalance } from '@/lib/invoices'

// Public origin for the customer-facing pay link. Mirrors lib/email.ts.
const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://traxevent.com'

// Build a `mailto:` draft the operator can review and send. In-app email is
// PAUSED, so a reminder is a hand-sent draft — never a re-issue of the invoice.
export function buildReminderMailto(email: string, invoice: Invoice): string {
  const balance = invoiceBalance(invoice)
  const number = invoice.number ?? invoice.id
  const dueDate = invoice.due_date ?? 'the due date'
  const payLink = `${PUBLIC_BASE_URL}/invoices/${invoice.token}`

  const subject = `Reminder: Invoice ${number} — $${balance.toFixed(2)} due ${dueDate}`
  const body =
    `Hi,\n\n` +
    `A friendly reminder that invoice ${number} for $${balance.toFixed(2)} was due ${dueDate}.\n\n` +
    `You can view and pay it here: ${payLink}\n\n` +
    `Thank you!`

  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return `mailto:${email}?${query}`
}
