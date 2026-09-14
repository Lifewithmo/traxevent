'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { shortDayLabel } from '@/lib/calendar-bookability'
import type { Lead } from '@/lib/types'

/**
 * The after-create landing signal (spec §6: "After Save … toast 'Opportunity
 * created — Jane Doe · Wedding · Oct 4 [Open]'"). Closing the loop is the
 * bedrock the market table pins on every CRM (Nielsen #1 — the dialog closes,
 * something must say the record now exists and where it went).
 *
 * Self-contained on purpose: it owns its 8s auto-dismiss and lives HERE, not in
 * components/ui — the kit is frozen, and this is a module-local pattern (the
 * pipeline's two views and the Clients cockpit), not yet a platform one.
 *
 * `shortDayLabel` ("Oct 4"), not the pipeline module's `shortDate` ("Oct 4,
 * 2026"): the toast copy is spec-pinned to the verdict banner's own date
 * vocabulary — it narrates the same create the BookabilityBanner just advised
 * on, and a created opp is near-term by construction, so the year is noise.
 */
export function opportunityCreatedMessage(
  lead: Pick<Lead, 'name' | 'event_type' | 'event_date'>
): string {
  const parts = [
    lead.name,
    lead.event_type,
    lead.event_date ? shortDayLabel(lead.event_date) : null,
  ].filter(Boolean)
  return `Opportunity created — ${parts.join(' · ')}`
}

/** How long the toast stands before dismissing itself (plan: 8s). */
const AUTO_DISMISS_MS = 8000

interface CreatedToastProps {
  message: string
  /** Deep link to the created record; omitted where the record is already on screen. */
  href?: string
  onDismiss: () => void
}

export function CreatedToast({ message, href, onDismiss }: CreatedToastProps) {
  /*
    Latest-ref for the dismiss handler so the 8s clock is armed exactly ONCE per
    mount. Callers pass an inline `() => setCreated(null)` — a fresh identity
    every parent render — and a timer effect depending on it would re-arm on
    each render, silently extending the toast forever on a busy page. Parents
    key the toast by the created lead's id, so a new create remounts it and
    gets a fresh clock.
  */
  const dismissRef = useRef(onDismiss)
  useEffect(() => { dismissRef.current = onDismiss })
  useEffect(() => {
    const t = setTimeout(() => dismissRef.current(), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    /*
      role="status" (implicit aria-live=polite) so the create is announced
      without stealing focus — the operator may already be typing the next one.
      Tokens only (popover surface, border, link), and the entrance animation is
      guarded with motion-reduce per the increment's hard gate.
    */
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <p className="min-w-0">{message}</p>
      {href && (
        <Link href={href} className="shrink-0 font-medium text-[var(--link)] underline-offset-4 hover:underline">
          Open
        </Link>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  )
}
