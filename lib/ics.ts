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

function vevent(item: CalendarItem, dtstamp: string): string[] {
  const date = item.date.slice(0, 10)
  const label = CALENDAR_KIND_LABELS[item.kind]
  const summary =
    item.kind === 'invoice_due' && item.amount !== undefined
      ? `${item.title} — $${item.amount.toLocaleString()}`
      : item.title
  const description = [label, item.detail].filter(Boolean).join(' · ')
  return [
    'BEGIN:VEVENT',
    `UID:${item.kind}-${item.id}@traxevent`,
    `DTSTAMP:${dtstamp}`,
    // All-day events: DTEND is exclusive, so a one-day event ends the next day.
    `DTSTART;VALUE=DATE:${icsDate(date)}`,
    `DTEND;VALUE=DATE:${icsDate(addDays(date, 1))}`,
    fold(`SUMMARY:${icsEscape(summary)}`),
    fold(`DESCRIPTION:${icsEscape(description)}`),
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
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TraxEvent//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${icsEscape(calendarName)}`),
    ...items.flatMap((i) => vevent(i, dtstamp)),
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}
