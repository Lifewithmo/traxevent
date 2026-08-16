import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const pillVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current",
  {
    variants: {
      tone: {
        confirmed: "bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]",
        pending: "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]",
        alert: "bg-[var(--status-alert-bg)] text-[var(--status-alert-fg)]",
        neutral: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

function StatusPill({
  tone, className, children,
}: { className?: string; children: React.ReactNode } & VariantProps<typeof pillVariants>) {
  return <span data-slot="status-pill" className={cn(pillVariants({ tone }), className)}>{children}</span>
}

export { StatusPill, pillVariants }
