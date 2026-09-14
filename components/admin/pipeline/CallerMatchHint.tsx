'use client'

import { Button } from '@/components/ui/button'
import type { Customer } from '@/lib/types'

/**
 * The caller-recognition card: "this phone/email/name is already a client —
 * link, or carry on as new?" Rendered inline under the contact fields the
 * moment the match fires, because the duplicate-client bleed happens exactly
 * while the operator is typing, not later in a dedupe report.
 *
 * NEVER auto-links (error prevention must not become error injection — a
 * father and son share a name, a couple shares a landline). Both moves are
 * one explicit tap, and `role="status"` announces the card's appearance to a
 * screen reader without stealing focus from the field being typed in.
 */
export function CallerMatchHint({
  customer,
  pastJobs,
  onLink,
  onDismiss,
}: {
  customer: Customer
  /** The customer's total opportunity count (spec: "Looks like Jane Doe · 3
   *  past jobs"); the segment is omitted entirely when the caller has no
   *  count to offer — never "undefined past jobs", never a guessed zero. */
  pastJobs?: number
  onLink: () => void
  onDismiss: () => void
}) {
  return (
    <div role="status" className="rounded-lg border border-border bg-muted/50 px-3 py-2">
      <p className="text-sm">
        Looks like <span className="font-medium">{customer.name}</span>
        {customer.company ? ` · ${customer.company}` : ''}
        {pastJobs != null ? ` · ${pastJobs} past ${pastJobs === 1 ? 'job' : 'jobs'}` : ''}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onLink}>Link</Button>
        <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
          No, new client
        </Button>
      </div>
    </div>
  )
}
