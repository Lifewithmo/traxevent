"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * The one gate in front of an irreversible action.
 *
 * `window.confirm` is the alternative it replaces: it is unstyled, unthemeable,
 * untestable, and blocks the whole tab. Keep this brick generic — it owns the
 * ceremony (title, consequence line, cancel, one committed verb) and nothing
 * about the record being acted on.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  onConfirm: () => void
  destructive?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
          {/* Close before running: the action owns its own busy/error surface on
              the page behind, so leaving the dialog up would double-report it. */}
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { ConfirmDialog }
