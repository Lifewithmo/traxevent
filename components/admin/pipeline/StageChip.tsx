'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LEAD_STAGE_LABELS, OPEN_STAGES } from '@/lib/leads'
import type { LeadStage } from '@/lib/types'

const MENU_STAGES: LeadStage[] = [...OPEN_STAGES, 'closed_won']

// Menu height/width approximate the kit's fixed-size popover (spec §7): used
// only to decide whether to flip up near the viewport bottom and to size the
// portalled menu itself.
const MENU_HEIGHT = 168
const MENU_WIDTH = 156

interface StageChipProps {
  stage: LeadStage
  ariaContext: string
  onStage: (stage: LeadStage) => void
  onMarkLost: () => void
}

export function StageChip({ stage, ariaContext, onStage, onMarkLost }: StageChipProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; flipped: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function close() {
      setOpen(false)
    }
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      close()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    // Capture phase so the menu closes on scroll anywhere (including inside
    // scrollable ancestors that wouldn't otherwise bubble a scroll event).
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('scroll', close, true)
    }
  }, [open])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const flipped = window.innerHeight - rect.bottom < MENU_HEIGHT + 12
      setPosition({
        top: flipped ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4,
        left: rect.left,
        flipped,
      })
    }
    setOpen(true)
  }

  function selectStage(next: LeadStage) {
    onStage(next)
    setOpen(false)
  }

  function selectMarkLost() {
    onMarkLost()
    setOpen(false)
  }

  const label = LEAD_STAGE_LABELS[stage]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Stage: ${label}. Change stage for ${ariaContext}.`}
        className="inline-flex h-[26px] items-center gap-1 rounded-full border border-border bg-background px-2.5 text-xs font-medium leading-none hover:bg-muted"
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Change stage for ${ariaContext}`}
            className="fixed z-50 space-y-0.5 rounded-md border border-border bg-background p-1 shadow-md"
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          >
            {MENU_STAGES.map((menuStage) => (
              <button
                key={menuStage}
                type="button"
                role="menuitem"
                onClick={() => selectStage(menuStage)}
                className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  menuStage === stage ? 'font-semibold' : ''
                }`}
              >
                {LEAD_STAGE_LABELS[menuStage]}
              </button>
            ))}
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              onClick={selectMarkLost}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-muted"
            >
              Mark lost
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
