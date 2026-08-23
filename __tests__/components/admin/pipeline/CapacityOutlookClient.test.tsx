import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import { CapacityOutlookClient } from '@/components/admin/pipeline/CapacityOutlookClient'
import type { CapacityMonth } from '@/lib/capacity/forecast'
import type { Org } from '@/lib/types'

const month = (over: Partial<CapacityMonth>): CapacityMonth => ({
  ym: '2026-09',
  label: 'Sep',
  cart: { ceiling: 27, booked: 23, open: 4 },
  room: { ceiling: 6, booked: 4, open: 2 },
  headroomValue: 9000,
  serviceableDays: 13,
  ...over,
})

afterEach(cleanup)

describe('CapacityOutlookClient — forecast', () => {
  it('renders open-of-ceiling for both kinds on a month row', () => {
    render(<CapacityOutlookClient orgSlug="demo" forecast={[month({})]} />)
    const row = screen.getByRole('listitem')
    // both kinds present with their honest open/ceiling ratio
    expect(within(row).getByText(/4/).textContent).toBeTruthy()
    expect(row).toHaveTextContent(/4\s*of\s*27/)
    expect(row).toHaveTextContent(/2\s*of\s*6/)
  })

  it('shows the ~$ headroom hero when there is a value signal', () => {
    render(<CapacityOutlookClient orgSlug="demo" forecast={[month({ headroomValue: 9000 })]} />)
    expect(screen.getByText(/~\$9k/)).toBeInTheDocument()
  })

  it('omits the $ headroom when there is no value signal', () => {
    render(<CapacityOutlookClient orgSlug="demo" forecast={[month({ headroomValue: 0 })]} />)
    expect(screen.queryByText(/\$/)).toBeNull()
  })

  it('names the mobile kind via kindLabel — an org override reads "carts"', () => {
    const labels: Org['resource_labels'] = { mobile: { one: 'cart', many: 'carts' } }
    render(<CapacityOutlookClient orgSlug="demo" forecast={[month({})]} resourceLabels={labels} />)
    expect(screen.getByText(/carts/)).toBeInTheDocument()
  })

  it('falls back to the neutral "serving units" noun with no override', () => {
    render(<CapacityOutlookClient orgSlug="demo" forecast={[month({})]} />)
    expect(screen.getByText(/serving units/)).toBeInTheDocument()
  })

  it('routes the meter aria-label through kindLabel so SR copy matches the visible override', () => {
    const labels: Org['resource_labels'] = { mobile: { one: 'cart', many: 'carts' } }
    render(<CapacityOutlookClient orgSlug="demo" forecast={[month({})]} resourceLabels={labels} />)
    // The cart meter announces the org's noun, not a hardcoded "Serving units".
    expect(screen.getByLabelText(/^carts: 23 of 27 booked, 4 open$/)).toBeInTheDocument()
    // And the neutral venue kind still reads "rooms", never a literal "Rooms" hardcode divorced from kindLabel.
    expect(screen.getByLabelText(/^rooms: 4 of 6 booked, 2 open$/)).toBeInTheDocument()
  })

  it('reports the working-day count as context', () => {
    render(<CapacityOutlookClient orgSlug="demo" forecast={[month({ serviceableDays: 13 })]} />)
    expect(screen.getByText(/13 working days/)).toBeInTheDocument()
  })

  it('renders one row per forecast month', () => {
    render(
      <CapacityOutlookClient
        orgSlug="demo"
        forecast={[month({ ym: '2026-09', label: 'Sep' }), month({ ym: '2026-10', label: 'Oct' })]}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
