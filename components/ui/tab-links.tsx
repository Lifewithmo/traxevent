import Link from "next/link"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

type TabLink<K extends string = string> = { key: K; label: string; href: string }

// URL-driven segmented control. Link-based rather than a stateful tab widget so
// it works inside a Server Component and the selection survives a reload/share.
//
// Heights are explicit (h-7 shell / h-6 item) so the control lines up with kit
// `Button size="sm"` (h-7) when the two share a toolbar row.
const tabLinkVariants = cva(
  "inline-flex h-6 items-center rounded-md px-2.5 text-sm whitespace-nowrap transition-colors",
  {
    variants: {
      selected: {
        // bg-card, not bg-background: card sits above muted in BOTH themes, so the
        // selected chip reads as raised in light and dark alike.
        true: "bg-card font-semibold text-foreground shadow-xs",
        false: "font-medium text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { selected: false },
  }
)

function TabLinks<K extends string>({
  tabs, active, ariaLabel, className,
}: { tabs: TabLink<K>[]; active: K; ariaLabel: string; className?: string }) {
  return (
    <nav
      data-slot="tab-links"
      aria-label={ariaLabel}
      className={cn(
        // max-w-full + overflow-x-auto: a group with many tabs scrolls rather
        // than pushing the page into a horizontal scroll on mobile.
        "inline-flex h-7 w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted p-0.5",
        className
      )}
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
