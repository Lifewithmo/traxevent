'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CALENDAR_KINDS, CALENDAR_KIND_LABELS, type CalendarKind } from '@/lib/calendar'

const STEPS: Array<{ app: string; steps: string }> = [
  { app: 'Outlook', steps: 'Calendar → Add calendar → Subscribe from web → paste the URL.' },
  { app: 'Google', steps: 'Other calendars → + → From URL → paste the URL.' },
  { app: 'Apple', steps: 'File → New Calendar Subscription → paste the URL.' },
]

/**
 * 15b: one URL now, accounts later. Each filter combination is its own feed
 * URL, so money can stay off a calendar you share.
 */
export function SubscribePanel({ url }: { url: string }) {
  const [included, setIncluded] = useState<Set<CalendarKind>>(new Set(CALENDAR_KINDS))
  const [copied, setCopied] = useState(false)

  const allOn = included.size === CALENDAR_KINDS.length
  const feedUrl = allOn ? url : `${url}?include=${CALENDAR_KINDS.filter((k) => included.has(k)).join(',')}`

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
    await navigator.clipboard.writeText(feedUrl)
    setCopied(true)
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
            {feedUrl}
          </code>
          <Button size="sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Read-only. Your calendar app decides how often it refreshes — Outlook is usually within a few hours, Google
          can take longer. Changes here always win.
        </p>
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
            <Button variant="outline" size="xs" disabled>
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
      </div>
    </div>
  )
}
