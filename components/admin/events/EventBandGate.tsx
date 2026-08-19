'use client'

// B1: the KPI band belongs to the event spine rendered by the LAYOUT, but two
// leaves must not carry it: 'dashboard' — the computed brief REPLACES the band
// (rendering both would print countdown/readiness/balance twice on one screen)
// — and 'checkin' — fold budget: the line-pressure redesign (T5) needs the
// first roster row within ~350px of the viewport top on a 375px phone. A
// server layout cannot see the active leaf, so this thin client wrapper gates
// the band per segment.
import { useSelectedLayoutSegment } from 'next/navigation'

const SUPPRESSED_LEAVES = new Set(['dashboard', 'checkin'])

export function EventBandGate({ children }: { children: React.ReactNode }) {
  const leaf = useSelectedLayoutSegment()
  if (leaf !== null && SUPPRESSED_LEAVES.has(leaf)) return null
  return <>{children}</>
}
