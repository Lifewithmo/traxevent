'use client'

import { useEffect, useRef } from 'react'

/**
 * ONE Escape, ONE dismissal.
 *
 * ── the problem ──────────────────────────────────────────────────────────────
 *
 * The cockpit had grown four independent Escape owners, none of which knew the
 * others existed:
 *
 *   1. AgendaView         — a `window` keydown, live whenever a bulk selection
 *                           exists, that clears the selection.
 *   2. CalendarLeftRail   — a `window` keydown, live whenever the mobile drawer
 *                           is open, that closes the drawer. It does NOT stop
 *                           propagation.
 *   3. reschedule-drag    — a `window` keydown for the duration of a pointer
 *                           gesture, that cancels the in-flight move.
 *   4. the Base UI Dialog — the ⌘K palette, the `?` sheet and now the peek.
 *
 * Any two of those on screen at once means one keypress dismisses both. The
 * palette pair happens to be safe TODAY only because Base UI 1.5.0's
 * `useDismiss` calls `stopPropagation()` on the Escape it consumes (see
 * `floating-ui-react/hooks/useDismiss.js`) — i.e. the invariant is currently a
 * side effect of a third-party default, not something this app states or tests.
 * The rail-drawer pair has no such guard and double-dismisses today.
 *
 * ── why a stack, and not the two cheaper fixes ────────────────────────────────
 *
 * "Make the palette stop propagation" only fixes the palette, and it is already
 * true; the next surface added still breaks it. "Make the agenda ignore Escape
 * while a modal is open" makes the LOWEST surface responsible for enumerating
 * every higher one — an N×M rule that has to be re-audited on every new overlay,
 * and whose only cheap implementation is sniffing the DOM for `[aria-modal]`.
 *
 * A stack states the actual rule once: Escape belongs to the most recently
 * opened dismissible surface, and nothing beneath it acts on the same keypress.
 * Adding a surface is one hook call; nothing else has to change.
 *
 * ── the two kinds of layer ───────────────────────────────────────────────────
 *
 * `useDismissLayer(active, onDismiss)` — the stack dismisses it.
 * `useTopDismissLayer(active)`         — the surface closes ITSELF (a Base UI
 *                                        Dialog does), and registers only so
 *                                        that layers underneath stay put.
 *
 * The listener lives on `window` in the BUBBLE phase, deliberately: a capture
 * listener there would run before the Dialog's own document handler and could
 * not be made to cooperate with it without re-implementing dismissal.
 */

interface Layer {
  /** null = the layer closes itself; the stack only reserves the top slot. */
  dismiss: (() => void) | null
}

const stack: Layer[] = []

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // Someone ahead of us already consumed it (an in-flight drag cancel calls
  // preventDefault). Consuming it twice is the exact bug this module removes.
  if (e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (!top) return
  if (!top.dismiss) return
  e.preventDefault()
  top.dismiss()
}

function push(layer: Layer) {
  if (stack.length === 0) window.addEventListener('keydown', onKeyDown)
  stack.push(layer)
}

function drop(layer: Layer) {
  const at = stack.lastIndexOf(layer)
  if (at !== -1) stack.splice(at, 1)
  if (stack.length === 0) window.removeEventListener('keydown', onKeyDown)
}

/**
 * How many dismissible surfaces are open. Exported for TESTS.
 *
 * NOT a "may I open a modal?" check, tempting as the name makes it look. This
 * counts every layer, modal or not: an agenda bulk selection registers one
 * (`useDismissLayer(selected.size > 0, …)`), and ⌘K must still open over that —
 * there is a test for exactly that in ItemPeek.test.tsx. A surface deciding
 * whether it would be stacking on another has to consult overlay STATE it owns,
 * which is what CalendarCanvas's ⌘K handler does. The stack answers "who gets
 * this Escape", and nothing else.
 */
export function dismissLayerCount(): number {
  return stack.length
}

function useLayer(active: boolean, dismiss: (() => void) | null, selfClosing: boolean) {
  // The callback identity changes every render; the LAYER must not, or the
  // effect would pop and re-push it and quietly promote it to the top — which
  // is exactly how a re-rendering agenda would start eating the peek's Escape.
  // Synced in its own effect (never during render) so the registration effect
  // below can stay keyed on `active` alone.
  const latest = useRef(dismiss)
  useEffect(() => {
    latest.current = dismiss
  })
  useEffect(() => {
    if (!active) return
    const layer: Layer = { dismiss: selfClosing ? null : () => latest.current?.() }
    push(layer)
    return () => drop(layer)
  }, [active, selfClosing])
}

/**
 * Register a surface the stack itself dismisses. `onDismiss` fires on Escape
 * ONLY while this is the topmost open layer.
 */
export function useDismissLayer(active: boolean, onDismiss: () => void) {
  useLayer(active, onDismiss, false)
}

/**
 * Register a surface that already closes itself on Escape (any Base UI
 * `Dialog`). It takes the top of the stack for as long as it is open, so a
 * selection or a drawer underneath survives the keypress that closed it.
 */
export function useTopDismissLayer(active: boolean) {
  useLayer(active, null, true)
}
