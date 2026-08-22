import { cn } from '@/lib/utils'
import { CALENDAR_KIND_LABELS, CALENDAR_KINDS, type CalendarKind } from '@/lib/calendar'
import { KIND_DOT, KIND_SHAPE, type KindShape } from '@/components/admin/calendar/kind-color'

/**
 * The calendar's kind mark: colour + SHAPE + a visually-hidden kind name.
 *
 * WCAG 1.4.1 (Use of Colour) — a bare coloured dot makes hue the sole carrier
 * of "what kind of thing is this", which fails for the ~8% of men with a
 * colour-vision deficiency, for anyone on a washed-out projector or in bright
 * sun, and for print. Every mark therefore carries three channels at once:
 *
 *   1. colour  — the verified `--cal-kind-*` ramp (>= ΔE 25 between all pairs)
 *   2. shape   — a distinct silhouette that survives greyscale and an 8px render
 *   3. text    — an `sr-only` kind name from CALENDAR_KIND_LABELS
 *
 * Geometry is authored in an 8x8 viewBox and deliberately uses the FULL box:
 * at the 8px sizes the grids render, a shape inset to 6px stops being
 * recognisable. Strokes are >= 1.7 units for the same reason.
 *
 * Drop-in for the bare `<span className="size-1.5 rounded-full" style={{...}}/>`
 * dots: it is an inline-flex span, so it sits in the same flex rows.
 */

const SHAPE_PATHS: Record<KindShape, React.ReactNode> = {
  // Booked — solid, "filled in".
  square: <rect x="0.6" y="0.6" width="6.8" height="6.8" rx="0.8" fill="currentColor" />,
  // Tentative — the same family, NOT filled in yet.
  'square-hollow': (
    <rect
      x="1.35"
      y="1.35"
      width="5.3"
      height="5.3"
      rx="0.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    />
  ),
  diamond: <path d="M4 0.15 L7.85 4 L4 7.85 L0.15 4 Z" fill="currentColor" />,
  triangle: <path d="M4 0.3 L7.95 7.4 L0.05 7.4 Z" fill="currentColor" />,
  circle: <circle cx="4" cy="4" r="3.5" fill="currentColor" />,
  bar: <rect x="0" y="2.7" width="8" height="2.6" rx="0.6" fill="currentColor" />,
  cross: (
    <path
      d="M2.9 0.1 H5.1 V2.9 H7.9 V5.1 H5.1 V7.9 H2.9 V5.1 H0.1 V2.9 H2.9 Z"
      fill="currentColor"
    />
  ),
}

interface KindDotProps {
  kind: CalendarKind
  /** Sizing/spacing for the mark. Defaults to the 8px grid mark. */
  className?: string
  /**
   * Drop the `sr-only` name. Only for places whose parent already announces the
   * kind (an `aria-label` on the wrapping link would swallow it anyway).
   */
  hideLabel?: boolean
  /** Passthrough so callers keep their existing test hooks. */
  'data-testid'?: string
}

export function KindDot({ kind, className, hideLabel, 'data-testid': testId }: KindDotProps) {
  return (
    <span
      data-slot="kind-dot"
      data-kind={kind}
      data-shape={KIND_SHAPE[kind]}
      data-testid={testId}
      className={cn('inline-flex shrink-0 items-center', className)}
    >
      <svg
        viewBox="0 0 8 8"
        className="size-2"
        style={{ color: KIND_DOT[kind] }}
        aria-hidden
        focusable="false"
      >
        {SHAPE_PATHS[KIND_SHAPE[kind]]}
      </svg>
      {hideLabel ? null : <span className="sr-only">{CALENDAR_KIND_LABELS[kind]}</span>}
    </span>
  )
}

/**
 * The persistent key for the marks above. A shape/colour grammar the operator
 * has to reverse-engineer is not an accessible one, so the legend is always on
 * screen in the cockpit rail rather than hidden behind a disclosure — the same
 * move Google Calendar and Outlook make with their always-visible calendar
 * lists.
 */
export function KindLegend({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
        Key
      </p>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
        {CALENDAR_KINDS.map((kind) => (
          <li key={kind} className="flex min-w-0 items-center gap-1.5">
            <KindDot kind={kind} hideLabel />
            <span className="min-w-0 truncate text-[11px] leading-tight text-sidebar-foreground">
              {CALENDAR_KIND_LABELS[kind]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
