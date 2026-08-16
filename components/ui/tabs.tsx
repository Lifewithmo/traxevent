"use client"

import { Tabs as BaseTabs } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

// Stateful sub-surface tabs: underline treatment, client state, and panels that
// can stay mounted. Use this when switching must NOT lose in-progress work —
// Catalog's package draft dies on a remount, which is why `keepMounted` exists.
//
// Not the same brick as `components/ui/tab-links.tsx`. TabLinks is a pill
// segmented control over `<Link>`s: URL-driven, Server-Component-safe, and used
// for FILTERING a view (Calendar's kind filter). Underline = "different
// sub-surfaces of this module"; pill = "same surface, narrower slice". Pick by
// which of those two things you mean, not by which file you found first.

function Tabs({ ...props }: BaseTabs.Root.Props) {
  return <BaseTabs.Root data-slot="tabs" {...props} />
}

function TabsList({ className, ...props }: BaseTabs.List.Props) {
  return (
    <BaseTabs.List
      data-slot="tabs-list"
      className={cn(
        "flex overflow-x-auto whitespace-nowrap border-b border-border",
        className
      )}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: BaseTabs.Tab.Props) {
  return (
    <BaseTabs.Tab
      data-slot="tabs-tab"
      className={cn(
        "-mb-px rounded-sm border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[active]:border-foreground data-[active]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: BaseTabs.Panel.Props) {
  return (
    <BaseTabs.Panel
      data-slot="tabs-panel"
      className={cn(
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

// No TabsIndicator: the active tab draws its own underline via
// `data-[active]:border-foreground` above. A sliding indicator would have to
// replace that, not sit alongside it.
export { Tabs, TabsList, TabsTab, TabsPanel }
