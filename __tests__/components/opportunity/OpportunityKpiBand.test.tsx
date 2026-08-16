import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OpportunityKpiBand } from '@/components/admin/opportunity/OpportunityKpiBand'
import type { OpportunityRollup } from '@/lib/opportunity-rollup'

const full: OpportunityRollup = {
  estValue: 4800,
  daysToEvent: 45,
  pastBookings: 2,
  openBalance: 1200,
  overdueBalance: 0,
  openTaskCount: 3,
  overdueTaskCount: 0,
}

// onAddValue/onAddDate are REQUIRED props — the tiles render real buttons when
// a figure is unset, so a consumer must always wire them. Tests that don't care
// which handler fired supply no-ops through this helper.
const noop = () => {}
function renderBand(
  rollup: OpportunityRollup,
  props: { eventDate?: string; onAddValue?: () => void; onAddDate?: () => void; className?: string } = {}
) {
  return render(
    <OpportunityKpiBand rollup={rollup} onAddValue={noop} onAddDate={noop} {...props} />
  )
}

describe('OpportunityKpiBand', () => {
  it('renders all four figure tiles', () => {
    renderBand(full, { eventDate: '2026-09-29' })
    expect(screen.getByText('Est. value')).toBeInTheDocument()
    expect(screen.getByText('Days to event')).toBeInTheDocument()
    expect(screen.getByText('Past bookings')).toBeInTheDocument()
    expect(screen.getByText('Open balance')).toBeInTheDocument()
    expect(screen.getByText('$4,800')).toBeInTheDocument()
    expect(screen.getByText('45 days')).toBeInTheDocument()
    expect(screen.getByText('Sep 29, 2026')).toBeInTheDocument()
  })

  it('never labels quoted pipeline value as revenue or collected cash', () => {
    const { container } = renderBand(full)
    expect(container.textContent).not.toMatch(/revenue|collected/i)
  })

  it('calls the open balance "Open balance" and notes that it is not yet due', () => {
    renderBand(full)
    expect(screen.getByText('$1,200')).toBeInTheDocument()
    expect(screen.getByText('not yet due')).toBeInTheDocument()
  })

  it('flags a returning client from the past-booking count', () => {
    renderBand(full)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('returning client')).toBeInTheDocument()
  })

  it('calls a client with no past bookings first-time', () => {
    renderBand({ ...full, pastBookings: 0 })
    expect(screen.getByText('first-time client')).toBeInTheDocument()
  })

  it('offers "+ Add value" instead of an em-dash when the estimate is unset', () => {
    const onAddValue = vi.fn()
    renderBand({ ...full, estValue: null }, { onAddValue })
    expect(screen.getByText('Not set')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Add value' }))
    expect(onAddValue).toHaveBeenCalledOnce()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('offers "+ Add date" instead of an em-dash when the event date is unset', () => {
    const onAddDate = vi.fn()
    renderBand({ ...full, daysToEvent: null }, { onAddDate })
    fireEvent.click(screen.getByRole('button', { name: '+ Add date' }))
    expect(onAddDate).toHaveBeenCalledOnce()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('shows no em-dash anywhere even when every optional figure is unset', () => {
    const { container } = renderBand({
      ...full, estValue: null, daysToEvent: null, openBalance: 0, pastBookings: 0,
    })
    expect(container.textContent).not.toContain('—')
    expect(container.textContent).not.toContain('None')
    expect(screen.getByText('nothing outstanding')).toBeInTheDocument()
  })

  it('puts the open-balance tile in alert tone with a destructive note when past due', () => {
    const { container } = renderBand({ ...full, overdueBalance: 400 })
    const value = screen.getByText('$1,200')
    expect(value.className).toContain('text-destructive')
    const tile = value.closest('[data-slot="stat-tile"]') as HTMLElement
    expect(tile.className).toContain('var(--status-alert-bg)')
    const note = screen.getByText('past due')
    expect(note.className).toContain('text-destructive')
    expect(note.className).not.toContain('text-muted-foreground')
    expect(container.textContent).not.toContain('not yet due')
  })

  it('warns in alert tone for an event inside two weeks', () => {
    renderBand({ ...full, daysToEvent: 9 })
    expect(screen.getByText('9 days').className).toContain('text-destructive')
  })

  // IMMINENT_DAYS is 14 and the test is `>= 0 && <= 14`. Both edges of that
  // window are asserted here, so an off-by-one in either comparison fails.
  it.each([
    [0, 'Today', true],
    [14, '14 days', true],
    [15, '15 days', false],
    [45, '45 days', false],
    [-1, '1 day ago', false],
  ] as const)('daysToEvent %i (%s) alert tone: %s', (daysToEvent, label, alert) => {
    renderBand({ ...full, daysToEvent })
    const value = screen.getByText(label)
    if (alert) expect(value.className).toContain('text-destructive')
    else expect(value.className).not.toContain('text-destructive')
  })

  it('does not warn for an event more than two weeks out', () => {
    renderBand({ ...full, daysToEvent: 45 })
    expect(screen.getByText('45 days').className).not.toContain('text-destructive')
  })

  // WCAG 1.4.1: colour cannot be the only channel. "9 days" and "90 days" must
  // differ by more than a tint, the way the Open balance tile says "past due".
  it('signals the imminent event in text, not by colour alone', () => {
    const { container } = renderBand({ ...full, daysToEvent: 9 }, { eventDate: '2026-08-24' })
    expect(container.textContent).toContain('soon')
    const note = screen.getByText('Aug 24, 2026 · soon')
    expect(note.className).toContain('text-destructive')
  })

  it('still carries the textual imminent cue when no event date is supplied', () => {
    renderBand({ ...full, daysToEvent: 0 })
    expect(screen.getByText('soon')).toBeInTheDocument()
  })

  it('does not say "soon" for an event that is far out', () => {
    const { container } = renderBand({ ...full, daysToEvent: 45 }, { eventDate: '2026-09-29' })
    expect(container.textContent).not.toContain('soon')
    expect(screen.getByText('Sep 29, 2026')).toBeInTheDocument()
  })

  it('reads "Today" on the day of the event and past tense afterwards', () => {
    const { rerender } = renderBand({ ...full, daysToEvent: 0 })
    expect(screen.getByText('Today')).toBeInTheDocument()
    rerender(
      <OpportunityKpiBand rollup={{ ...full, daysToEvent: -3 }} onAddValue={noop} onAddDate={noop} />
    )
    expect(screen.getByText('3 days ago')).toBeInTheDocument()
  })

  it('says "1 day", not "1 days"', () => {
    renderBand({ ...full, daysToEvent: 1 })
    expect(screen.getByText('1 day')).toBeInTheDocument()
  })

  it('uses semantic tokens only — no raw Tailwind colour literals', () => {
    const { container } = renderBand({ ...full, overdueBalance: 400 })
    const html = container.innerHTML
    for (const raw of ['text-gray-', 'bg-white', 'bg-emerald-', 'text-red-', 'text-[var(--link)]']) {
      expect(html).not.toContain(raw)
    }
  })

  it('forwards a className so the consumer can retune the grid in a narrow spine', () => {
    const { container } = renderBand(full, { className: 'max-[1400px]:grid-cols-2' })
    const band = container.querySelector('[data-slot="kpi-band"]') as HTMLElement
    expect(band.className).toContain('max-[1400px]:grid-cols-2')
  })
})
