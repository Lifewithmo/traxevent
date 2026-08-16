import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const tileVariants = cva(
  "flex flex-col gap-0.5 rounded-xl border bg-card p-3 shadow-xs",
  {
    variants: {
      tone: {
        default: "border-border",
        money: "border-border",
        alert: "border-[var(--status-alert-bg)] bg-[color-mix(in_srgb,var(--status-alert-bg)_30%,var(--card))]",
      },
    },
    defaultVariants: { tone: "default" },
  }
)
const valueTone = { default: "", money: "text-[var(--money-green)]", alert: "text-destructive" } as const

function StatTile({
  label, value, note, tone = "default", className,
}: { label: string; value: string; note?: string; className?: string } & VariantProps<typeof tileVariants>) {
  return (
    <div data-slot="stat-tile" className={cn(tileVariants({ tone }), className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{label}</span>
      <span className={cn("text-[20px] font-semibold leading-tight tracking-[-.02em] tabular-nums", valueTone[tone ?? "default"])}>{value}</span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  )
}

export { StatTile, tileVariants }
