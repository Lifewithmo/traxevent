import type { CalendarKind } from '@/lib/calendar'

// Color-by-kind for the cockpit canvas — tokens only, so a palette sweep
// restyles every view at once. One source of truth shared by the time-grid,
// week, month and agenda views so a kind reads the same everywhere.
//
// These point at the dedicated `--cal-kind-*` ramp in app/globals.css rather
// than the semantic roles they used to borrow. The semantic palette is a
// TWO-HUE system (sapphire + neutral, with green/amber/red reserved for money
// and status), so it cannot yield seven separable categories: `--primary` and
// `--link` are literally the same value, which made `event` (a booked job) and
// `lead` (a tentative hold) ΔE 0.0 apart in BOTH themes — one swatch for the
// highest-stakes pair on the screen — while `drop`/`follow_up` collided a
// second time at ΔE 10.2 light / 4.6 dark. The replacement ramp is verified by
// __tests__/components/admin/calendar/kind-palette.test.ts, which resolves
// these vars back out of globals.css and fails any pair under ΔE 20.
export const KIND_DOT: Record<CalendarKind, string> = {
  event: 'var(--cal-kind-event)', // booked client job — sapphire
  drop: 'var(--cal-kind-drop)', // pickup fulfilment — forest
  lead: 'var(--cal-kind-lead)', // tentative hold — violet
  invoice_due: 'var(--cal-kind-invoice-due)', // money owed — amber
  follow_up: 'var(--cal-kind-follow-up)', // outreach — teal
  task: 'var(--cal-kind-task)', // routine work — graphite
  compliance: 'var(--cal-kind-compliance)', // risk / blocker — red
}

/**
 * The NON-colour channel (WCAG 1.4.1 Use of Colour). Colour alone can never
 * carry the kind, so every mark also has a silhouette that survives greyscale,
 * an 8px render and every flavour of colour-vision deficiency.
 *
 * Grammar: **SHAPE = family, FILL = commitment.**
 *   event  = square         — booked, filled in
 *   lead   = square-hollow  — the same family, not filled in yet
 *   drop   = diamond        — fulfilment
 *   invoice_due = triangle  — money, pointed at a deadline
 *   follow_up   = circle    — outreach
 *   task   = bar            — routine work
 *   compliance = cross      — risk / blocker
 */
export type KindShape =
  | 'square'
  | 'square-hollow'
  | 'diamond'
  | 'triangle'
  | 'circle'
  | 'bar'
  | 'cross'

export const KIND_SHAPE: Record<CalendarKind, KindShape> = {
  event: 'square',
  lead: 'square-hollow',
  drop: 'diamond',
  invoice_due: 'triangle',
  follow_up: 'circle',
  task: 'bar',
  compliance: 'cross',
}
