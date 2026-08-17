import type { CalendarKind } from '@/lib/calendar'

// Color-by-kind for the cockpit canvas — tokens only, so the Signal-palette
// sweep restyles every view at once. One source of truth shared by the
// time-grid, week, and month views so a kind reads the same colour everywhere.
//
// Colour is never the SOLE signal (WCAG 1.4.1): every dot/chip/grid item is
// paired with a visually-hidden kind label. The tokens are chosen from distinct
// hue families so the kinds stay separable, and money-green is reserved for
// actual money (invoice amounts), not borrowed for the `event` kind.
export const KIND_DOT: Record<CalendarKind, string> = {
  event: 'var(--primary)', // booked client job — the strong anchor hue
  drop: 'var(--money-green-strong)', // pickup fulfilment — green
  lead: 'var(--link)', // tentative hold — copper/accent
  invoice_due: 'var(--status-pending-fg)', // money owed — amber
  follow_up: 'var(--status-confirmed-fg)', // outreach — olive
  task: 'var(--muted-foreground)', // routine work — neutral
  compliance: 'var(--destructive)', // risk / blocker — red
}
