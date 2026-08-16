'use client'

import { Button } from '@/components/ui/button'
import { KpiBand } from '@/components/ui/kpi-band'
import { PipelineStatTile } from '@/components/admin/pipeline/PipelineStatTile'
import { money, shortDate } from '@/lib/pipeline-presentation'
import type { OpportunityRollup } from '@/lib/opportunity-rollup'

interface OpportunityKpiBandProps {
  rollup: OpportunityRollup
  /** Display-only companion to `rollup.daysToEvent` — the note under the count. */
  eventDate?: string
  /**
   * REQUIRED, not optional. When the figure is unset the tile renders a real
   * "+ Add value" / "+ Add date" button; a consumer that omitted the handler
   * would ship a focusable control that silently does nothing — strictly worse
   * than the em-dash these replaced. Making them required moves that mistake
   * from runtime to compile time.
   */
  onAddValue: () => void
  onAddDate: () => void
  className?: string
}

/** Event inside two weeks: the operator needs to be looking at it. */
const IMMINENT_DAYS = 14

function daysLabel(n: number): string {
  if (n === 0) return 'Today'
  const abs = Math.abs(n)
  const unit = abs === 1 ? 'day' : 'days'
  return n > 0 ? `${abs} ${unit}` : `${abs} ${unit} ago`
}

/**
 * The note under the day count. Carries a textual "· soon" cue in the imminent
 * state: WCAG 1.4.1 forbids colour as the only channel, and without it "9 days"
 * and "90 days" differ by tint alone. Mirrors how the Open balance tile says
 * "past due" rather than merely turning red.
 */
function eventNote(eventDate: string | undefined, imminent: boolean): string | undefined {
  const date = eventDate ? shortDate(eventDate) : undefined
  if (!imminent) return date
  return date ? `${date} · soon` : 'soon'
}

/**
 * The four figures an operator checks before deciding what to do with an
 * opportunity. Exactly four tiles because KpiBand lays out 4-up above 1000px
 * and 2-up below (components/ui/kpi-band.tsx:8): four fills both breakpoints
 * exactly, where three would leave a dead cell in the 4-up row.
 *
 * "Est. value" is QUOTED pipeline value and "Open balance" is invoice balance.
 * Neither is revenue and neither is cash collected — see the load-bearing
 * warning at ClientKpiBand.tsx:16-18. Do not relabel them.
 *
 * The band lives in a lg:col-span-3 spine (~60% of max-w-6xl). If 4-up crushes
 * there, the consumer passes className="max-[1400px]:grid-cols-2".
 */
export function OpportunityKpiBand({
  rollup,
  eventDate,
  onAddValue,
  onAddDate,
  className,
}: OpportunityKpiBandProps) {
  const { estValue, daysToEvent, pastBookings, openBalance, overdueBalance } = rollup
  const pastDue = overdueBalance > 0
  const imminent = daysToEvent !== null && daysToEvent >= 0 && daysToEvent <= IMMINENT_DAYS

  return (
    <KpiBand className={className}>
      <PipelineStatTile
        label="Est. value"
        value={estValue === null ? 'Not set' : money(estValue)}
        tone={estValue === null ? 'default' : 'money'}
        note={estValue === null ? undefined : 'quoted, not invoiced'}
        action={
          estValue === null ? (
            <Button variant="link" size="xs" className="h-auto self-start px-0" onClick={onAddValue}>
              + Add value
            </Button>
          ) : undefined
        }
      />

      <PipelineStatTile
        label="Days to event"
        value={daysToEvent === null ? 'Not set' : daysLabel(daysToEvent)}
        tone={imminent ? 'alert' : 'default'}
        note={daysToEvent === null ? undefined : eventNote(eventDate, imminent)}
        noteTone={imminent ? 'alert' : 'default'}
        action={
          daysToEvent === null ? (
            <Button variant="link" size="xs" className="h-auto self-start px-0" onClick={onAddDate}>
              + Add date
            </Button>
          ) : undefined
        }
      />

      <PipelineStatTile
        label="Past bookings"
        value={String(pastBookings)}
        note={pastBookings > 0 ? 'returning client' : 'first-time client'}
      />

      <PipelineStatTile
        label="Open balance"
        value={money(openBalance)}
        tone={pastDue ? 'alert' : 'money'}
        note={openBalance === 0 ? 'nothing outstanding' : pastDue ? 'past due' : 'not yet due'}
        noteTone={pastDue ? 'alert' : 'default'}
      />
    </KpiBand>
  )
}
