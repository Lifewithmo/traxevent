import { cn } from "@/lib/utils"

// Responsive StatTile row: 4-up above 1000px, 2-up below. Shared across every
// module landing page (Today/Pipeline/Invoices/Calendar/Clients) so the KPI
// strip reflows the same way everywhere instead of each page reinventing it.
//
// `inset` is the full-bleed-page treatment: pad the band to the page gutter and
// close it with a rule, so the tiles line up with a `px-5` header above them
// instead of sitting flush against the viewport edge. Opt-in for now — existing
// consumers (Today, Clients) keep their current rendering until they adopt it.
function KpiBand({
  children,
  inset = false,
  className,
}: {
  children: React.ReactNode
  inset?: boolean
  className?: string
}) {
  return (
    <div
      data-slot="kpi-band"
      className={cn(
        "grid grid-cols-4 gap-2.5 max-[1000px]:grid-cols-2",
        inset && "border-b border-border px-5 py-3",
        className
      )}
    >
      {children}
    </div>
  )
}

export { KpiBand }
