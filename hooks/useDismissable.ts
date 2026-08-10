'use client'

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'

/**
 * Escape + outside-pointerdown dismissal for hand-rolled popovers/menus/dialogs.
 * Returns focus to whatever triggered the popover open (typically its trigger
 * button) once it closes.
 *
 * Focus-return target capture: reading `document.activeElement` once the
 * popover is already open loses to any `autoFocus` element rendered inside it
 * — autoFocus is applied during React's commit/layout phase, which runs
 * before this hook's (passive) effect. Instead, the trigger is captured while
 * the popover is CLOSED, from the pointerdown/keydown that causes it to open.
 * Those are real user-gesture events, and the trigger is the only focusable
 * thing rendered while closed, so they can only ever target it — critically,
 * an autoFocus `.focus()` call inside the popover does not dispatch
 * pointerdown/keydown, so it can never clobber this capture (a `focusin`-based
 * capture would not have that guarantee: the "closed" listener is still
 * attached — cleanup runs later, in the passive-effect phase — when autoFocus
 * fires during the very commit that opens the popover, so it would end up
 * capturing the autoFocus'd element instead of the trigger).
 * `document.activeElement` at open-time is kept only as a fallback for
 * programmatic opens (no preceding user gesture).
 *
 * `setOpen` must be a stable state setter (the one returned by useState) —
 * an inline callback would re-run this effect, and re-capture/re-focus, on
 * every unrelated re-render while the popover is open.
 */
export function useDismissable<T extends HTMLElement>(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  containerRef: RefObject<T | null>
) {
  const triggerRef = useRef<HTMLElement | null>(null)

  // While closed, remember what's about to become the trigger: the last
  // pointerdown/keydown target inside the container.
  useEffect(() => {
    if (open) return
    function remember(e: Event) {
      if (containerRef.current?.contains(e.target as Node)) {
        triggerRef.current = e.target as HTMLElement
      }
    }
    document.addEventListener('pointerdown', remember)
    document.addEventListener('keydown', remember)
    return () => {
      document.removeEventListener('pointerdown', remember)
      document.removeEventListener('keydown', remember)
    }
  }, [open, containerRef])

  useEffect(() => {
    if (!open) return
    // Fallback for programmatic opens (no prior gesture inside the container).
    triggerRef.current ??= document.activeElement as HTMLElement | null

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
      triggerRef.current?.focus()
      // Clear so a stale trigger from this cycle isn't reused (and isn't
      // focused again) the next time the popover opens.
      triggerRef.current = null
    }
  }, [open, setOpen, containerRef])
}
