'use client'

// B1: the KPI band belongs to the event spine rendered by the LAYOUT, but
// three leaves must not carry it: 'dashboard' — the computed brief REPLACES
// the band (rendering both would print countdown/readiness/balance twice on
// one screen) — 'checkin' — fold budget: the line-pressure redesign (T5) needs
// the first roster row within ~350px of the viewport top on a 375px phone —
// and 'ops' — the day-of surfaces (load-out, run sheet, closeout) carry their
// own readiness UI: the band's countdown/guests tiles duplicated the sticky
// header's T-minus/date and the derivation caption's guest count on a phone.
// A server layout cannot see the active leaf, so this thin client wrapper
// gates the band per segment.
import { useSelectedLayoutSegment } from 'next/navigation'

const SUPPRESSED_LEAVES = new Set(['dashboard', 'checkin', 'ops'])

export function EventBandGate({ children }: { children: React.ReactNode }) {
  const leaf = useSelectedLayoutSegment()
  if (leaf !== null && SUPPRESSED_LEAVES.has(leaf)) return null
  return <>{children}</>
}
