"use client"

import { Tabs as BaseTabs } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

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
