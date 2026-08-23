import { cn } from '@/lib/utils'
import { VERDICT_LABEL, type BookabilityVerdict } from '@/lib/calendar-bookability'

/**
 * The bookability mark: SHAPE + text + (only then) colour.
 *
 * WCAG 1.4.1. This branch has just finished fixing a use-of-colour failure of
 * exactly this kind on the calendar's kind dots, so shading a day cell green /
 * amber / grey and calling it done would reintroduce it one component over.
 * Every mark therefore carries three channels, the same grammar
 * `components/admin/calendar/KindDot.tsx` established:
 *
 *   1. shape  — a silhouette that survives greyscale and an 8px render
 *   2. text   — an `sr-only` verdict name (or a visible one on the n:1 surfaces)
 *   3. colour — a tint, never the sole carrier
 *
 * `open` HAS NO MARK, deliberately. A calendar that paints every free day green
 * is a calendar with nothing to say: the signal is the exception, and an
 * always-on affirmation trains the eye to skip the row where the exception
 * finally appears. Free is the default state of a date, and the default state
 * gets no ink (Tufte; Rams). That is also why `verdictTone()` returns an empty
 * string for `open` rather than a "success" background.
 *
 * Colour choice: `tight` borrows the existing `--warn-*` triple, `closed` uses
 * plain muted. NOT red — red is spoken for in this cockpit by overdue money and
 * lapsed compliance (a real emergency). A day you cannot prep for is not an
 * error; it is just not available, and the palette should not shout it down.
 */

const SHAPES: Record<Exclude<BookabilityVerdict, 'open'>, React.ReactNode> = {
  // Half-full: capacity is running out but has not run out.
  tight: (
    <>
      <circle cx="4" cy="4" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M0.7 4 A3.3 3.3 0 0 0 7.3 4 Z" fill="currentColor" />
    </>
  ),
  // The universal "no": circle with a slash. Reads at 8px and in greyscale.
  closed: (
    <>
      <circle cx="4" cy="4" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.65 6.35 L6.35 1.65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
}

/**
 * Grid-cell tint: BACKGROUND ONLY. Empty for `open` — the default state gets no
 * ink.
 *
 * Deliberately does not recolour the cell's text. A month cell is mostly other
 * people's data — the day number, the kind dots, the "+3" overflow — and
 * repainting all of it warning-brown would make a merely-busy Saturday look
 * like a failed one. The tint is a wash behind the day; the mark and the
 * aria-label carry the meaning.
 *
 * `closed` is 60% muted rather than full, so the day link's own `hover:bg-muted`
 * still reads as a hover state on top of it.
 */
export function verdictCellTone(verdict: BookabilityVerdict): string {
  if (verdict === 'tight') return 'bg-[var(--warn-bg)]'
  if (verdict === 'closed') return 'bg-muted/60'
  return ''
}

/**
 * The `closed` cell's TEXTURE — diagonal hatching, the thing every scheduling
 * product uses for "this slot is not available" (Calendly, Resy, OpenTable's
 * host view, Goodshuffle's inventory grid all hatch or strike a blocked slot).
 *
 * It is here because the flat tint was not enough. Walked in the browser against
 * the real palette, `bg-muted/60` on this theme resolves to #f2f4f6 over an
 * #f7f8fa page — a 1% luminance step, invisible on anything but a calibrated
 * monitor. The 8px glyph was carrying the entire verdict on its own, which is
 * accessible but not legible: an operator scanning a month should see the
 * unavailable band without hunting for glyphs.
 *
 * Hatching is a texture, not a hue, so it is the one reinforcement that costs
 * nothing in colour budget: it survives greyscale, colour-vision deficiency,
 * sunlight and print, and it does not spend the red that this cockpit reserves
 * for overdue money and lapsed compliance. Built from `--muted-foreground` so it
 * tracks both themes with no new token (app/globals.css is not this
 * increment's to edit).
 *
 * An inline style rather than a class: the pattern is a `repeating-linear-
 * gradient`, which has no place in a utility vocabulary and no reason to become
 * one for a single use.
 */
const CLOSED_HATCH =
  'repeating-linear-gradient(135deg, transparent 0 5px, ' +
  'color-mix(in oklab, var(--muted-foreground) 26%, transparent) 5px 6px)'

export function verdictCellStyle(verdict: BookabilityVerdict): React.CSSProperties | undefined {
  return verdict === 'closed' ? { backgroundImage: CLOSED_HATCH } : undefined
}

/**
 * Banner tint: background, foreground AND border, for the n:1 surfaces where the
 * verdict IS the content (the day spine).
 *
 * The border is not decoration. Walked in the browser: `bg-muted` on this
 * theme's page background is a ~1% luminance step, so the `closed` banner read
 * as loose text rather than a panel while the amber `tight` one read as a card —
 * the two states looked like different KINDS of thing rather than two values of
 * one thing. One hairline each fixes the grouping (Gestalt: common region).
 */
export function verdictTone(verdict: BookabilityVerdict): string {
  if (verdict === 'tight') return 'border border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-fg)]'
  if (verdict === 'closed') return 'border border-border bg-muted text-muted-foreground'
  return ''
}

interface BookabilityMarkProps {
  verdict: BookabilityVerdict
  /**
   * Drop the `sr-only` name. ONLY for a mark whose ancestor already announces
   * the verdict — an `aria-label` on a wrapping link swallows the subtree, so a
   * label here would be silently dropped and the cell would lose its text
   * channel entirely (see `cellAriaLabel` in MonthGrid).
   */
  hideLabel?: boolean
  className?: string
  'data-testid'?: string
}

/** The 8px glyph. Inherits `currentColor`, so it stays legible on the inverted
 *  "today" chip in the week header as well as on a tinted cell. */
export function BookabilityMark({
  verdict,
  hideLabel,
  className,
  'data-testid': testId,
}: BookabilityMarkProps) {
  if (verdict === 'open') return null
  return (
    <span
      data-slot="bookability-mark"
      data-verdict={verdict}
      data-testid={testId}
      className={cn('inline-flex shrink-0 items-center', className)}
    >
      <svg viewBox="0 0 8 8" className="size-2" aria-hidden focusable="false">
        {SHAPES[verdict]}
      </svg>
      {hideLabel ? null : <span className="sr-only">{VERDICT_LABEL[verdict]} for booking</span>}
    </span>
  )
}

/**
 * The always-on key for the two marks.
 *
 * Nielsen #6, recognition over recall: a shape grammar the operator has to
 * remember is not an accessible one. The cockpit rail already keeps the
 * calendar's kind legend permanently on screen for the same reason
 * (`KindLegend`), and this is the second grammar on the same grid — so it gets
 * the same treatment rather than a tooltip. "No mark" is spelled out too,
 * because the absence of a glyph is itself a value here.
 */
export function BookabilityKey({ className }: { className?: string }) {
  return (
    <ul className={cn('space-y-0.5', className)}>
      <li className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
        <BookabilityMark verdict="tight" hideLabel />
        <span>Tight — capacity is spoken for</span>
      </li>
      <li className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
        <BookabilityMark verdict="closed" hideLabel />
        <span>Closed — something blocks it</span>
      </li>
      <li className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
        <span aria-hidden className="inline-flex size-2 shrink-0" />
        <span>No mark — open to book</span>
      </li>
    </ul>
  )
}
