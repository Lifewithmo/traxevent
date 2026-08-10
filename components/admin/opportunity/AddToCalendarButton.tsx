'use client'

import { buildIcs } from '@/lib/ics'

/**
 * 15b: one date as an .ics download, no subscription needed. Built in the
 * browser — no server round-trip for a single VEVENT.
 */
export function AddToCalendarButton({ title, date }: { title: string; date: string }) {
  function download() {
    const ics = buildIcs(
      [{ id: `one-${date}`, title, date, kind: 'event', href: '' }],
      title,
      new Date()
    )
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button type="button" onClick={download} className="text-xs text-muted-foreground underline hover:text-foreground">
      Add to my calendar
    </button>
  )
}
