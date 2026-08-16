'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Separator } from '@/components/ui/separator'
import { StatusPill } from '@/components/ui/status-pill'
import { LEAD_STAGE_LABELS, OPEN_STAGES } from '@/lib/leads'
import { STAGE_TONE } from '@/lib/pipeline-presentation'
import type { LeadStage } from '@/lib/types'

const MENU_STAGES: LeadStage[] = [...OPEN_STAGES, 'closed_won']

interface StageChipProps {
  stage: LeadStage
  ariaContext: string
  onStage: (stage: LeadStage) => void
  onMarkLost: () => void
}

/**
 * Every ancestor of `el` that can scroll independently — the board column
 * (`overflow-y-auto`) is one, the page is not. Only a CLIPPING scroller can
 * carry the trigger out of sight while the portalled popup stays put, so those
 * are the only elements the open menu needs to watch.
 */
function scrollableAncestors(el: HTMLElement | null): HTMLElement[] {
  const found: HTMLElement[] = []
  let node = el?.parentElement ?? null
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') found.push(node)
    node = node.parentElement
  }
  return found
}

/**
 * The pipeline's stage CHANGER — a status readout that is also the control that
 * moves the deal. Both the list and the board render it, so it is the single
 * place stage colour and stage transitions are defined.
 *
 * It is deliberately not a bare `StatusPill`: the pill is the trigger's skin,
 * the button is the affordance. Portalling, flip/collision handling, outside
 * dismissal, Escape, roving focus and the menu/menuitem ARIA all come from the
 * kit `Menu` (Base UI) — this file hand-rolled all of that before and does not
 * any more. The two things Base UI cannot supply on its own are the descriptive
 * `aria-label` (only the caller knows WHICH opportunity the row is) and
 * `aria-expanded` — see below.
 *
 * `open` is CONTROLLED, for three reasons that all need the same state:
 *
 *  1. a11y. Base UI 1.5.0's MenuTrigger reads its trigger props through an
 *     `isMountedByTrigger` selector gated on `activeTriggerId === triggerId`,
 *     which never matches for a `render`ed trigger — so the trigger it hands us
 *     is stuck at `aria-expanded="false"` even while `data-popup-open` is set
 *     and the popup is in the document. Owning `open` lets us write the correct
 *     value by hand.
 *  2. Drag. Base UI opens on MOUSEDOWN (`useClick(..., { event: 'mousedown' })`),
 *     and the board nests this chip inside a `draggable` card — see the drag
 *     effect below.
 *  3. Scroll. See the scroll effect below.
 */
export function StageChip({ stage, ariaContext, onStage, onMarkLost }: StageChipProps) {
  const label = LEAD_STAGE_LABELS[stage]
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const draggingRef = useRef(false)

  // DRAG. The board (PipelineBoardView) makes every card a `draggable` article
  // with the chip inside it, and Base UI opens this menu on mousedown rather
  // than click. A press-and-drag that starts on the chip therefore pops the
  // menu open on the same frame the drag begins — the old click-driven chip
  // never did, because a click never fires after a drag. So while the card is
  // actually being dragged the chip refuses to open, and dismisses itself if
  // the mousedown already opened it.
  useEffect(() => {
    const dragSource = triggerRef.current?.closest<HTMLElement>('[draggable="true"]')
    if (!dragSource) return

    function handleDragStart() {
      draggingRef.current = true
      setOpen(false)
    }
    function handleDragEnd() {
      draggingRef.current = false
    }
    dragSource.addEventListener('dragstart', handleDragStart)
    dragSource.addEventListener('dragend', handleDragEnd)
    return () => {
      dragSource.removeEventListener('dragstart', handleDragStart)
      dragSource.removeEventListener('dragend', handleDragEnd)
    }
  }, [])

  // SCROLL. floating-ui's `autoUpdate` re-anchors the popup as the page moves,
  // which is right for page scroll — but the popup is portalled to the body, so
  // it is NOT clipped by the board column it belongs to. Scroll that column and
  // the trigger's row leaves while the menu keeps floating over the column
  // header. Base UI computes floating-ui's `hide` middleware and exposes the
  // answer as `data-anchor-hidden`, but the kit popup styles nothing on it and
  // components/ui is not ours to change — so the chip closes itself instead,
  // from its own clipping scrollers only. (Not a document-wide capture
  // listener: ordinary page scroll should still re-anchor, not dismiss.)
  useEffect(() => {
    if (!open) return
    const scrollers = scrollableAncestors(triggerRef.current)
    if (scrollers.length === 0) return

    function close() {
      setOpen(false)
    }
    for (const scroller of scrollers) {
      scroller.addEventListener('scroll', close, { passive: true })
    }
    return () => {
      for (const scroller of scrollers) scroller.removeEventListener('scroll', close)
    }
  }, [open])

  function handleOpenChange(next: boolean) {
    if (next && draggingRef.current) return
    setOpen(next)
  }

  return (
    <Menu open={open} onOpenChange={handleOpenChange}>
      <MenuTrigger
        render={
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`Stage: ${label}. Change stage for ${ariaContext}.`}
            className="inline-flex w-fit rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <StatusPill tone={STAGE_TONE[stage]}>
          {label}
          <ChevronDown aria-hidden="true" className="size-3 opacity-70" />
        </StatusPill>
      </MenuTrigger>
      <MenuContent aria-label={`Change stage for ${ariaContext}`}>
        {MENU_STAGES.map((menuStage) => (
          <MenuItem
            key={menuStage}
            onClick={() => onStage(menuStage)}
            className={`justify-between gap-6 ${menuStage === stage ? 'font-semibold' : ''}`}
          >
            {LEAD_STAGE_LABELS[menuStage]}
            {menuStage === stage && <Check aria-hidden="true" className="size-3.5 shrink-0" />}
          </MenuItem>
        ))}
        <Separator className="my-1" />
        <MenuItem
          onClick={onMarkLost}
          className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
        >
          Mark lost
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
