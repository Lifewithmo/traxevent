import { type VariantProps } from 'class-variance-authority'
import { tileVariants } from '@/components/ui/stat-tile'
import { cn } from '@/lib/utils'

/**
 * The one thing that must be duplicated: the kit declares `valueTone` as a
 * module-private const and does NOT export it (only `StatTile` and
 * `tileVariants` leave the file). Keep these three values identical to
 * components/ui/stat-tile.tsx:17; if the kit ever exports it, import instead.
 */
const valueTone = {
  default: '',
  money: 'text-[var(--money-green)]',
  alert: 'text-destructive',
} as const

interface PipelineStatTileProps extends VariantProps<typeof tileVariants> {
  label: string
  value: string
  note?: string
  /** 'alert' paints the note destructive — the reason this tile isn't the kit's. */
  noteTone?: 'default' | 'alert'
  /**
   * Rendered in the note slot INSTEAD of `note`. Use a `Button variant="link"`
   * ("+ Add value") so an unset figure offers the next action rather than a dash.
   * Links use `text-primary`, never `text-[var(--link)]` (no dark override).
   */
  action?: React.ReactNode
  className?: string
}

/**
 * Pipeline-local figure tile.
 *
 * Container classes come from the kit's own exported `tileVariants`
 * (components/ui/stat-tile.tsx:31) — imported, never copied, so this tile can
 * never drift out of the kit's tone palette. It exists as a separate component
 * only because the kit tile (a) hard-codes its note to `text-muted-foreground`,
 * which cannot say "past due" in alert tone, and (b) has no action slot, which
 * is how an unset figure gets its "+ Add" affordance instead of an em-dash. The
 * kit is frozen this increment; if it later grows `noteTone` + `action`, delete
 * this file and import StatTile.
 */
function PipelineStatTile({
  label,
  value,
  note,
  tone = 'default',
  noteTone = 'default',
  action,
  className,
}: PipelineStatTileProps) {
  return (
    <div data-slot="stat-tile" className={cn(tileVariants({ tone }), className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-[20px] font-semibold leading-tight tracking-[-.02em] tabular-nums',
          valueTone[tone ?? 'default']
        )}
      >
        {value}
      </span>
      {action ? (
        action
      ) : note ? (
        <span className={cn('text-xs', noteTone === 'alert' ? 'text-destructive' : 'text-muted-foreground')}>
          {note}
        </span>
      ) : null}
    </div>
  )
}

// `tileVariants` is deliberately NOT re-exported: the kit already exports a
// symbol of that exact name, and two would make auto-import ambiguous.
export { PipelineStatTile }
