import Link from 'next/link'
import { BookabilityMark, verdictTone } from '@/components/admin/calendar/BookabilityMark'
import {
  shortDayLabel,
  weekdayName,
  VERDICT_LABEL,
  type Bookability,
} from '@/lib/calendar-bookability'
import { calendarHref } from '@/lib/calendar-href'
import { cn } from '@/lib/utils'

/** One geometry for an alternative-date chip, whichever element renders it —
 *  the <Link> on the calendar and the <button> in a form must be the same chip
 *  to the eye and the thumb. 24px tall (WCAG 2.5.8). */
const ALT_CHIP =
  'inline-flex min-h-6 items-center rounded-md border border-current/25 px-1.5 text-xs font-medium tabular-nums hover:bg-current/10'

/**
 * THE ANSWER TO "ARE YOU FREE THAT DAY?", stated in full.
 *
 * This is the n:1 surface. The month cell gets an 8px glyph because it has to
 * say the same thing forty-two times; here there is exactly ONE day, so the
 * verdict gets the sentence, the numbers it fired on, the link to the field
 * behind it and the dates to offer instead — everything the operator needs to
 * finish the phone call without opening anything else.
 *
 * It renders ABOVE the empty state, not inside the populated branch, on purpose.
 * "Nothing scheduled" over a day whose only cart is blocked out is precisely the
 * misreading this whole feature exists to remove: an empty day is not the same
 * claim as a free one.
 *
 * It never blocks. "Book a job" stays live underneath on a `closed` day — the
 * operator knows things the model does not (they can borrow a cart, they can
 * prep in four days if they have to). A verdict that vetoed the booking would
 * be wrong exactly when it mattered most.
 */
export function BookabilityBanner({
  orgSlug,
  bookability,
  onPickAlternative,
  className,
}: {
  orgSlug: string
  bookability: Bookability
  /** When present, alternative-date chips render as <button type="button"> calling this
   *  instead of Links to the calendar. Fix-links stay Links in both modes. */
  onPickAlternative?: (ymd: string) => void
  className?: string
}): React.ReactElement {
  const { verdict, binding, basis, alternatives } = bookability

  // Open: one quiet line, no panel, no green. The operator asked and got a
  // positive answer — Norman's feedback — but a free day is the default state
  // and the default state does not get a coloured box.
  //
  // WHAT THE LINE IS ALLOWED TO SAY depends on `basis`. This sentence used to be
  // a hardcoded "nothing on file stands in the way of this day" printed on every
  // open verdict — including, on the degraded arm, directly above that same
  // day's job block, because a lone booking is not enough to reach `tight` when
  // no capacity is configured. An `unverified` basis leads with the claim the
  // engine can actually support ("nothing ELSE on file"), states the ignorance
  // in the module's own words, and carries the link that resolves it.
  //
  // Still no tint and still no mark: the verdict IS open, and painting it would
  // flag the default state of every solo org — the same false-flag class the
  // zero-units backstop exists to prevent. What narrows is the claim, not the
  // answer.
  if (verdict === 'open' || !binding) {
    const unverified = basis?.kind === 'unverified'
    return (
      <p
        data-slot="bookability-banner"
        data-verdict="open"
        data-basis={basis?.kind ?? 'clear'}
        className={cn('px-4 pt-3 text-xs leading-snug text-muted-foreground', className)}
      >
        <span className="font-medium text-foreground">
          {unverified ? 'Nothing else on file.' : 'Open for booking.'}
        </span>{' '}
        {basis ? basis.reason : 'Nothing on file stands in the way of this day.'}{' '}
        {unverified && basis?.fixHref ? (
          <Link
            href={basis.fixHref}
            className="inline-flex min-h-6 items-center font-medium underline underline-offset-2 hover:no-underline"
          >
            Set up capacity
          </Link>
        ) : null}
      </p>
    )
  }

  return (
    <section
      data-slot="bookability-banner"
      data-verdict={verdict}
      aria-label="Bookability"
      className={cn('mx-4 mt-3 rounded-lg px-3 py-2.5', verdictTone(verdict), className)}
    >
      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
        <BookabilityMark verdict={verdict} hideLabel />
        <span>{VERDICT_LABEL[verdict]} for booking</span>
      </p>
      {/* The binding constraint, named. One sentence, operator language. */}
      <p className="mt-1 text-xs leading-snug">{binding.reason}</p>
      {/* PROVENANCE. The exact values the rule fired on — so a verdict that
          looks wrong can be checked, not just disbelieved — and a link to the
          field that produced it, so it can be fixed at source rather than
          worked around. */}
      {/* NO opacity utility here, and that is deliberate. Walked in the browser
          and measured: `opacity-80` on this 10px line resolves to 3.43:1 in
          light mode (3.99:1 on the amber) against a 4.5:1 AA floor — a WCAG
          1.4.3 failure invisible to every test in the suite, because a class
          name tells you nothing about a contrast ratio. The hierarchy this
          line needs is already carried by size, case and family; dimming it
          was buying nothing and costing legibility.
          break-words: a 360px spine on a phone, and this is a long run of
          key=value pairs with no natural break points. */}
      <p className="mt-1.5 break-words font-mono text-[10px] uppercase tracking-wide">
        {binding.rule} ·{' '}
        {Object.entries(binding.inputs)
          .map(([k, v]) => `${k}=${v}`)
          .join(' · ')}
      </p>
      <Link
        href={binding.fixHref}
        className="mt-1.5 inline-flex min-h-6 items-center text-xs font-medium underline underline-offset-2 hover:no-underline"
      >
        Check the setting behind this
      </Link>
      {alternatives.length > 0 ? (
        <div className="mt-2 border-t border-current/15 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[.06em]">
            Next open {weekdayName(alternatives[0])}
          </p>
          {/* Offerable, not merely informational: each is a link straight to
              that day's spine, so "how about the 20th?" is one tap away. 24px
              tall (WCAG 2.5.8). In a form (`onPickAlternative`), navigating
              away would hang up on the caller — the same chip becomes a
              type="button" that sets the date field instead, and never
              submits the form it sits in. */}
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {alternatives.map((alt) => (
              <li key={alt}>
                {onPickAlternative ? (
                  <button type="button" onClick={() => onPickAlternative(alt)} className={ALT_CHIP}>
                    {shortDayLabel(alt)}
                  </button>
                ) : (
                  <Link href={calendarHref({ orgSlug, ymd: alt })} className={ALT_CHIP}>
                    {shortDayLabel(alt)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
