import { cn } from "@/lib/utils"

// Responsive StatTile row: 4-up above 1000px, 2-up below. Shared across every
// module landing page (Today/Pipeline/Invoices/Calendar/Clients) so the KPI
// strip reflows the same way everywhere instead of each page reinventing it.
function KpiBand({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-slot="kpi-band" className={cn("grid grid-cols-4 gap-2.5 max-[1000px]:grid-cols-2", className)}>
      {children}
    </div>
  )
}

export { KpiBand }
