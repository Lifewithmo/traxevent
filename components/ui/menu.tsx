"use client"

import { Menu as BaseMenu } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

function Menu({ ...props }: BaseMenu.Root.Props) {
  return <BaseMenu.Root data-slot="menu" {...props} />
}

function MenuTrigger({ className, ...props }: BaseMenu.Trigger.Props) {
  return (
    <BaseMenu.Trigger
      data-slot="menu-trigger"
      className={cn(className)}
      {...props}
    />
  )
}

function MenuContent({
  className,
  children,
  ...props
}: BaseMenu.Popup.Props) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner sideOffset={6} align="end">
        <BaseMenu.Popup
          data-slot="menu-content"
          className={cn(
            "z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none",
            className
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

function MenuItem({ className, ...props }: BaseMenu.Item.Props) {
  return (
    <BaseMenu.Item
      data-slot="menu-item"
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-muted data-highlighted:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Menu, MenuTrigger, MenuContent, MenuItem }
