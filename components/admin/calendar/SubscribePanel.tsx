'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CALENDAR_KINDS, CALENDAR_KIND_LABELS, type CalendarKind } from '@/lib/calendar'

// @/actions/calendar-sync is imported LAZILY (inside the effect and the handler
// below) rather than statically: its module graph pulls in firebase-admin, which
// throws at import time without server env vars — a static import here would force
// every test that renders CalendarLeftRail to mock this action. Same reasoning,
// and same shape, as IntakeLinkCard.

const STEPS: Array<{ app: string; steps: string }> = [
  { app: 'Outlook', steps: 'Calendar → Add calendar → Subscribe from web → paste the URL.' },
  { app: 'Google', steps: 'Other calendars → + → From URL → paste the URL.' },
  { app: 'Apple', steps: 'File → New Calendar Subscription → paste the URL.' },
]

/**
 * The panel only ever receives the assembled feed URL
 * (`${origin}/ics/${orgSlug}/${token}`), so the slug it needs to rotate the token
 * is read back out of it. `prefix` is everything up to and including the last
 * slash, i.e. the URL with its token lopped off — rotating just re-appends.
 */
function feedParts(url: string): { orgSlug: string; prefix: string } {
  const prefix = url.slice(0, url.lastIndexOf('/') + 1)
  return { orgSlug: prefix.slice(0, -1).split('/').pop() ?? '', prefix }
}

/**
 * 15b: one URL now, accounts later. Each filter combination is its own feed
 * URL, so money can stay off a calendar you share.
 */
export function SubscribePanel({ url }: { url: string }) {
  const [included, setIncluded] = useState<Set<CalendarKind>>(new Set(CALENDAR_KINDS))
  const [copied, setCopied] = useState(false)
  // Set once a rotation lands, so the panel shows the URL that now works rather
  // than the dead one the server rendered.
  const [rotatedUrl, setRotatedUrl] = useState<string | null>(null)
  const [canRotate, setCanRotate] = useState(false)
  const [confirmingRotate, setConfirmingRotate] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [rotateError, setRotateError] = useState<string | null>(null)

  const base = rotatedUrl ?? url
  const { orgSlug, prefix } = feedParts(base)

  const allOn = included.size === CALENDAR_KINDS.length
  // The footgun this closes: with nothing checked, `join(',')` produced `?include=`,
  // an empty param the route used to read as "no filter" and answer with EVERY kind
  // — the exact opposite of what the operator asked for. The route now fails closed
  // on it; here we make sure such a URL is never displayed or copied in the first
  // place, so it cannot be pasted into a calendar app that would just 404.
  const nothingChecked = included.size === 0
  const feedUrl = allOn ? base : `${base}?include=${CALENDAR_KINDS.filter((k) => included.has(k)).join(',')}`

  // Owner/admin only — the server enforces it too (assertOrgAdmin); this decides
  // whether the control is drawn at all. Best-effort: a failed probe means no
  // button, never a broken one.
  useEffect(() => {
    if (!orgSlug) return
    let alive = true
    import('@/actions/calendar-sync')
      .then(({ canRotateIcsToken }) => canRotateIcsToken(orgSlug))
      .then((ok) => {
        if (alive) setCanRotate(ok)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [orgSlug])

  function toggle(kind: CalendarKind) {
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
    setCopied(false)
  }

  async function copy() {
    // Belt and braces behind the disabled button: the empty-filter URL must not
    // reach a clipboard by any route this function is ever wired to.
    if (nothingChecked) return
    await navigator.clipboard.writeText(feedUrl)
    setCopied(true)
  }

  async function rotate() {
    setRotating(true)
    setRotateError(null)
    try {
      const { rotateIcsToken } = await import('@/actions/calendar-sync')
      setRotatedUrl(`${prefix}${await rotateIcsToken(orgSlug)}`)
      setCopied(false)
    } catch (err: unknown) {
      setRotateError(err instanceof Error ? err.message : 'Could not regenerate the feed URL')
    } finally {
      setRotating(false)
    }
  }

  return (
    <div className="border-b border-border bg-muted/40 px-5 py-4">
      <h2 className="text-sm font-semibold">Calendar sync</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Put TraxEvent dates on the calendar you already use.</p>

      <div className="mt-3 max-w-xl">
        <div className="flex items-baseline justify-between">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Subscribe by link
          </h3>
          <span className="text-[10px] text-muted-foreground">Available now</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2 py-1.5 text-xs">
            {nothingChecked ? (
              <span className="text-muted-foreground">Nothing selected — pick a kind below.</span>
            ) : (
              feedUrl
            )}
          </code>
          <Button size="sm" onClick={copy} disabled={nothingChecked}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Read-only. Your calendar app decides how often it refreshes — Outlook is usually within a few hours, Google
          can take longer. Changes here always win.
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">Treat this link like a key.</strong> Anyone who has it can
          read the feed without logging in — no password, no account.
        </p>
        {canRotate ? (
          <div className="mt-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={rotating}
              onClick={() => setConfirmingRotate(true)}
            >
              {rotating ? 'Regenerating…' : 'Regenerate feed URL'}
            </Button>
            <div aria-live="assertive" aria-atomic="true">
              {rotateError ? <p className="mt-1 text-[11px] text-destructive">{rotateError}</p> : null}
            </div>
          </div>
        ) : null}
        <div className="mt-1 flex gap-3 text-[11px]">
          {STEPS.map((s) => (
            <details key={s.app}>
              <summary className="cursor-pointer underline">{s.app} steps</summary>
              <p className="mt-1 max-w-52 text-muted-foreground">{s.steps}</p>
            </details>
          ))}
        </div>
      </div>

      <div className="mt-4 max-w-xl">
        <div className="flex items-baseline justify-between">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Connect an account
          </h3>
          <span className="text-[10px] text-muted-foreground">Later</span>
        </div>
        {['Microsoft Outlook', 'Google Calendar'].map((name) => (
          <div key={name} className="mt-1.5 flex items-center justify-between rounded border border-border/60 px-2.5 py-1.5 opacity-50">
            <span className="text-xs">{name}</span>
            {/* The row is already muted to 50%; the Button's own disabled:opacity-50
                would compound to 25% and make it fainter than the label beside it. */}
            <Button variant="outline" size="xs" disabled className="disabled:opacity-100">
              Connect
            </Button>
          </div>
        ))}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Two-way: edits made in your calendar come back. Needs a conflict rule before it&rsquo;s safe to build.
        </p>
      </div>

      <div className="mt-4 max-w-xl">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Include on the feed
        </h3>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {CALENDAR_KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={included.has(kind)} onChange={() => toggle(kind)} />
              {CALENDAR_KIND_LABELS[kind]}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Each filter is a separate feed URL, so money can stay off a calendar you share.
        </p>
        {/* Point-of-action feedback: the checkboxes are at the BOTTOM of the panel
            and the Copy button at the top, so the disabled button on its own would
            leave the operator hunting for the reason. */}
        <div aria-live="polite" aria-atomic="true">
          {nothingChecked ? (
            <p role="alert" className="mt-1.5 text-[11px] font-medium text-destructive">
              Pick at least one — a feed with nothing on it has no link to copy.
            </p>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingRotate}
        onOpenChange={setConfirmingRotate}
        title="Regenerate the feed URL?"
        description="Every existing subscription breaks, for everyone. Every calendar already pointed at this org — yours and your crew's — stops updating until each person re-subscribes with the new link. The old URL cannot be brought back."
        confirmLabel="Regenerate"
        busyLabel="Regenerating…"
        destructive
        pending={rotating}
        onConfirm={() => void rotate()}
      />
    </div>
  )
}
