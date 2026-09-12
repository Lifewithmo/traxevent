import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The gate reads the active leaf segment; vary it per test through hoisted state.
const nav = vi.hoisted(() => ({ segment: null as string | null }))
vi.mock('next/navigation', () => ({
  useSelectedLayoutSegment: () => nav.segment,
}))

import { EventBandGate } from '@/components/admin/events/EventBandGate'

const renderGate = (segment: string | null) => {
  nav.segment = segment
  return render(
    <EventBandGate>
      <div data-testid="band">KPI band</div>
    </EventBandGate>
  )
}

describe('EventBandGate', () => {
  // 'dashboard' renders the computed brief, which replaces the band;
  // 'checkin' spends its fold budget on the roster; 'ops' day-of surfaces
  // carry their own readiness UI. The band would duplicate all three.
  it.each(['dashboard', 'checkin', 'ops'])('suppresses the band on the %s leaf', (leaf) => {
    renderGate(leaf)
    expect(screen.queryByTestId('band')).not.toBeInTheDocument()
  })

  it('renders the band on the families leaf', () => {
    renderGate('families')
    expect(screen.getByTestId('band')).toBeInTheDocument()
  })

  it('renders the band on the itinerary leaf', () => {
    renderGate('itinerary')
    expect(screen.getByTestId('band')).toBeInTheDocument()
  })

  it('renders the band when no leaf segment is active (null)', () => {
    renderGate(null)
    expect(screen.getByTestId('band')).toBeInTheDocument()
  })

  it('renders the band on an unrecognized leaf', () => {
    renderGate('some-future-leaf')
    expect(screen.getByTestId('band')).toBeInTheDocument()
  })
})
