import Link from "next/link"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"

export type RelatedRow = {
  id: string; title: string; subtitle?: string; badge?: React.ReactNode
  amount?: string; amountTone?: "default" | "money" | "alert"; href?: string
  /** Interactive controls (buttons, menus). Rendered OUTSIDE the row's anchor —
   *  `<a>` excludes interactive descendants, so a button nested in the link is
   *  invalid HTML and leaves keyboard/AT focus order unreliable. */
  actions?: React.ReactNode
}

const amountClass = { default: "", money: "text-[var(--money-green)]", alert: "text-destructive" } as const

function Row({ row }: { row: RelatedRow }) {
  const body = (
    <div className={cn("flex items-center justify-between gap-3 py-2", row.actions ? "pl-3 pr-2" : "px-3")}>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">{row.title}</p>
        {row.subtitle ? <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {row.badge}
        {row.amount ? <span className={cn("text-[13px] font-semibold tabular-nums", amountClass[row.amountTone ?? "default"])}>{row.amount}</span> : null}
      </div>
    </div>
  )
  // No actions: the anchor (or plain div) *is* the row, exactly as before.
  if (!row.actions) {
    return row.href ? <Link href={row.href} className="block border-t border-border first:border-t-0 hover:bg-muted/50">{body}</Link>
      : <div className="border-t border-border first:border-t-0">{body}</div>
  }
  // With actions: a flex container owns the row chrome so the controls sit
  // beside the link rather than inside it, and hovering anywhere still tints.
  return (
    <div className={cn("flex items-center border-t border-border first:border-t-0", row.href && "hover:bg-muted/50")}>
      {row.href ? <Link href={row.href} className="block min-w-0 flex-1">{body}</Link> : <div className="min-w-0 flex-1">{body}</div>}
      <div className="flex shrink-0 items-center gap-1 pr-3">{row.actions}</div>
    </div>
  )
}

function RelatedRecordCard({
  title, count, rows, previewLimit = 3, newLabel = "+ New", onNew, newDisabled,
  emptyTitle, emptyCtaLabel, onEmptyCta, emptyCtaDisabled, footer, className,
}: {
  title: string; count: number; rows: RelatedRow[]; previewLimit?: number
  newLabel?: string; onNew?: () => void; emptyTitle: string; emptyCtaLabel?: string
  onEmptyCta?: () => void; footer?: React.ReactNode; className?: string
  /** Both default to enabled, so a caller that tracks no in-flight state is
   *  unaffected. A create handler that mints a fresh id per call has no
   *  data-layer backstop, so the caller must be able to shut the button while
   *  its request is open or a double-click writes two records. */
  newDisabled?: boolean; emptyCtaDisabled?: boolean
}) {
  const shown = rows.slice(0, previewLimit)
  return (
    <section data-slot="related-record-card" className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-xs", className)}>
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <h4 className="text-[13px] font-semibold">{title}</h4>
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums">{count}</span>
        </div>
        {onNew ? <Button variant="ghost" size="xs" onClick={onNew} disabled={newDisabled}>{newLabel}</Button> : null}
      </header>
      {rows.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          action={
            // No handler means there is nothing for the button to do; render
            // none rather than an inert control the reader will click.
            onEmptyCta && emptyCtaLabel
              ? <Button variant="outline" size="sm" onClick={onEmptyCta} disabled={emptyCtaDisabled}>{emptyCtaLabel}</Button>
              : undefined
          }
        />
      ) : (
        <div>
          {shown.map((r) => <Row key={r.id} row={r} />)}
          {rows.length > previewLimit ? <p className="border-t border-border px-3 py-2 text-center text-xs font-medium text-[var(--link)]">View all {count} →</p> : null}
          {footer}
        </div>
      )}
    </section>
  )
}

export { RelatedRecordCard }
