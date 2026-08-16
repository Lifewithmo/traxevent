import Link from "next/link"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

type TabLink = { key: string; label: string; href: string }

// URL-driven segmented control. Link-based rather than a stateful tab widget so
// it works inside a Server Component and the selection survives a reload/share.
const tabLinkVariants = cva(
  "rounded-md px-2.5 py-1 text-sm whitespace-nowrap transition-colors",
  {
    variants: {
      selected: {
        true: "bg-background font-semibold text-foreground shadow-xs",
        false: "font-medium text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { selected: false },
  }
)

function TabLinks({
  tabs, active, ariaLabel, className,
}: { tabs: TabLink[]; active: string; ariaLabel: string; className?: string }) {
  return (
    <nav
      data-slot="tab-links"
      aria-label={ariaLabel}
      className={cn("inline-flex w-fit items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5", className)}
    >
      {tabs.map((t) => {
        const selected = t.key === active
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={selected ? "page" : undefined}
            className={tabLinkVariants({ selected })}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

export { TabLinks, tabLinkVariants }
export type { TabLink }
