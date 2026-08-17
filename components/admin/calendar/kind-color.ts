import type { CalendarKind } from '@/lib/calendar'

// Color-by-kind for the cockpit canvas — tokens only, so the Signal-palette
// sweep restyles every view at once. One source of truth shared by the
// time-grid, week, and month views so a kind reads the same colour everywhere.
// Each token already passes the WCAG gate against the surface it sits on
// (card/background); dots are decorative and paired with a text label.
export const KIND_DOT: Record<CalendarKind, string> = {
  event: 'var(--money-green)',
  drop: 'var(--money-green-strong)',
  lead: 'var(--status-pending-fg)',
  invoice_due: 'var(--link)',
  follow_up: 'var(--status-confirmed-fg)',
  task: 'var(--muted-foreground)',
  compliance: 'var(--destructive)',
}
