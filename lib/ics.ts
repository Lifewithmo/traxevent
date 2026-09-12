import type { CalendarItem } from '@/lib/calendar'
import { CALENDAR_KIND_LABELS } from '@/lib/calendar'
import { addDays } from '@/lib/opportunity-detail'

// RFC 5545 text escaping: backslash first, then structural characters.
export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function icsDate(ymd: string): string {
  return ymd.slice(0, 10).replace(/-/g, '')
}

/** RFC 5545 floating local date-time, e.g. ('2026-08-18','16:00') → '20260818T160000'. */
function icsDateTime(ymd: string, hhmm: string): string {
  return `${icsDate(ymd)}T${hhmm.replace(/:/g, '')}00`
}

/** Lines over 75 octets must fold onto continuation lines (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 75) {
    out.push(rest.slice(0, 75))
    rest = ' ' + rest.slice(75)
  }
  out.push(rest)
  return out.join('\r\n')
}

/**
 * `href` is app-relative, which is useless inside a calendar app — nothing there
 * knows what host to resolve it against. Absolute or nothing: when the origin is
 * unset the URL line is omitted entirely rather than emitted relative or empty.
 */
function absoluteHref(href: string, origin: string): string | null {
  if (!origin || !href) return null
  try {
    return new URL(href, origin).toString()
  } catch {
    return null
  }
}

function vevent(item: CalendarItem, dtstamp: string, origin: string): string[] {
  const date = item.date.slice(0, 10)
  const label = CALENDAR_KIND_LABELS[item.kind]
  const summary =
    item.kind === 'invoice_due' && item.amount !== undefined
      ? `${item.title} — $${item.amount.toLocaleString()}`
      : item.title
  const description = [label, item.detail].filter(Boolean).join(' · ')
  // Timed items (event working hours, drop windows) get real DTSTART/DTEND so
  // two windows on the same day are distinguishable; timed DTEND is inclusive.
  // Everything else is an all-day event, whose DTEND is exclusive (the day AFTER
  // the last spanned day) — so a multi-day event (endDate set) exports as a true
  // span, not a single day.
  const lastDay = (item.endDate ?? date).slice(0, 10)
  const dateLines =
    item.start && item.end
      ? [`DTSTART:${icsDateTime(date, item.start)}`, `DTEND:${icsDateTime(date, item.end)}`]
      : [`DTSTART;VALUE=DATE:${icsDate(date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(lastDay, 1))}`]
  const link = absoluteHref(item.href, origin)
  return [
    'BEGIN:VEVENT',
    `UID:${item.kind}-${item.id}@traxevent`,
    `DTSTAMP:${dtstamp}`,
    ...dateLines,
    fold(`SUMMARY:${icsEscape(summary)}`),
    fold(`DESCRIPTION:${icsEscape(description)}`),
    // Without this an operator gets a title and a time and no way to navigate.
    // TEXT value type, so it escapes exactly like SUMMARY/DESCRIPTION.
    ...(item.location ? [fold(`LOCATION:${icsEscape(item.location)}`)] : []),
    // URI value type — NOT text, so it is folded but never backslash-escaped
    // (escaping would corrupt the link the crew taps).
    ...(link ? [fold(`URL:${link}`)] : []),
    ...(item.tentative ? ['STATUS:TENTATIVE'] : []),
    'END:VEVENT',
  ]
}

/**
 * A read-only all-day feed. `now` is injected so output is deterministic;
 * DTSTAMP is required per event but carries no meaning for an all-day feed.
 */
export function buildIcs(items: CalendarItem[], calendarName: string, now: Date): string {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  // Read once per build so every VEVENT agrees, and at call time so a test can
  // stub it. Unset ⇒ no URL line anywhere (see absoluteHref).
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ?? ''
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TraxEvent//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${icsEscape(calendarName)}`),
    ...items.flatMap((i) => vevent(i, dtstamp, origin)),
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}
