"use client"

import * as React from "react"

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
 * The committed verb, and the one-shot guard in front of it.
 *
 * `window.confirm` blocked the main thread, so a second activation was
 * physically impossible. Closing a React dialog replaces none of that:
 * `onOpenChange(false)` only *schedules* the close, and this button stays
 * mounted and clickable until that commit lands — long enough for a held Enter
 * key (browsers repeat `click` on keydown for a focused <button>), a fast
 * double-click, or automation to run the irreversible action twice.
 *
 * The ref is the real guard: it flips synchronously inside the handler, so a
 * second activation is rejected before it can reach `onConfirm`. The state only
 * exists to disable the button visibly on the next paint. A state flag alone
 * could not do this — two activations in one commit window read the same
 * pre-click closure.
 *
 * It lives in its own component so the guard re-arms by unmounting with the
 * popup rather than by resetting itself: a reset keyed on `open` would have to
 * fire while the popup is still up for its closing animation, reopening the
 * exact window this exists to shut.
 */
function ConfirmButton({
  confirmLabel,
  busyLabel,
  destructive,
  pending,
  onConfirm,
  onOpenChange,
}: {
  confirmLabel: string
  busyLabel?: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}) {
  const committed = React.useRef(false)
  const [confirming, setConfirming] = React.useState(false)
  const busy = confirming || pending === true

  function handleConfirm() {
    if (committed.current || pending) return
    committed.current = true
    setConfirming(true)
    // Close before running: the action owns its own busy/error surface on the
    // page behind, so leaving the dialog up would double-report it.
    onOpenChange(false)
    onConfirm()
  }

  return (
    <Button
      type="button"
      variant={destructive ? "destructive" : "default"}
      disabled={busy}
      onClick={handleConfirm}
    >
      {busy && busyLabel ? busyLabel : confirmLabel}
    </Button>
  )
}

/**
 * The one gate in front of an irreversible action.
 *
 * `window.confirm` is the alternative it replaces: it is unstyled, unthemeable,
 * untestable, and blocks the whole tab. Keep this brick generic — it owns the
 * ceremony (title, consequence line, cancel, one committed verb) and nothing
 * about the record being acted on.
 *
 * It also owns the one guarantee `window.confirm` gave away for free: the verb
 * runs exactly once per opening. See `ConfirmButton`.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel,
  onConfirm,
  destructive,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  /** Swapped in once the verb is committed. Only visible to callers that keep the dialog open. */
  busyLabel?: string
  onConfirm: () => void
  destructive?: boolean
  /**
   * Caller-driven in-flight state, for a caller whose dialog stays up across the
   * request. The internal guard covers the common case on its own; this exists so
   * a caller that already tracks the request does not have to fight it.
   */
  pending?: boolean
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
          <ConfirmButton
            confirmLabel={confirmLabel}
            busyLabel={busyLabel}
            destructive={destructive}
            pending={pending}
            onConfirm={onConfirm}
            onOpenChange={onOpenChange}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { ConfirmDialog }
