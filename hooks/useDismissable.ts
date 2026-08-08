'use client'

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'

/**
 * Escape + outside-pointerdown dismissal for hand-rolled popovers/menus/dialogs.
 * Returns focus to whatever was focused when the popover opened (typically its
 * trigger button) once it closes. `setOpen` must be a stable state setter (the
 * one returned by useState) — an inline callback would re-run this effect, and
 * re-capture/re-focus, on every unrelated re-render while the popover is open.
 */
export function useDismissable<T extends HTMLElement>(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  containerRef: RefObject<T | null>
) {
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement as HTMLElement | null

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
    }
  }, [open, setOpen, containerRef])
}
