// The readiness horizon rail answers ONE question on the org events home:
// "which job bites me next, and why?" — ranked worst-first by the selector
// (lib/ops/readiness-horizon.ts). The deciding value is the TOP ROW: every
// number arrives with its interpretation ('3 overdue', 'Load list 4/18' —
// never a bare count), and every row deep-links to the surface where the
// blocker is actually fixed — the event's Ops tab (plan setup lives there too,
// so 'No ops plan yet' lands on the instantiate flow, not a dead end).
// Rows are pre-gated by the page: members only see events whose ops page they
// may open, so the link never bounces.
import Link from 'next/link'
import { StatusPill } from '@/components/ui/status-pill'
import type { HorizonRow } from '@/lib/ops/readiness-horizon'

const SECTION_HEADING = 'mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'

export function ReadinessHorizonRail({ orgSlug, rows }: { orgSlug: string; rows: HorizonRow[] }) {
  return (
    <section aria-label="Readiness horizon — next 14 days">
      <h2 className={SECTION_HEADING}>
        Needs attention <span className="font-normal normal-case tracking-normal">· next 14 days</span>
      </h2>

      {rows.length === 0 ? (
        // Designed quiet state — muted, never hidden: the rail's absence would
        // read as "not built", its quiet presence reads as "all clear".
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-muted-foreground">Nothing at risk in the next 14 days</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Jobs with overdue deadlines, an unfinished load list, or no ops plan surface here as they
            enter the window.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.event_id}>
              <Link
                href={`/${orgSlug}/${row.slug}/ops`}
                className="block rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{row.name}</span>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                    {row.days_label}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {row.signals.map((s) => (
                    <StatusPill key={s.text} tone={s.tone}>
                      {s.text}
                    </StatusPill>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
