import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import { CapacityOutlookClient } from '@/components/admin/pipeline/CapacityOutlookClient'
import type { CapacityMonth } from '@/lib/capacity/forecast'
import type { ScheduleLane } from '@/lib/capacity/schedule'
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

// A cell with sensible open defaults, overridable per test.
const cell = (over: Partial<ScheduleLane['cells'][number]>): ScheduleLane['cells'][number] => ({
  date: '2026-09-05',
  serviceable: true,
  unitAvailable: true,
  ...over,
})

const scheduleFixture: ScheduleLane[] = [
  {
    unitId: 'u1',
    unitName: 'Kart 1',
    kind: 'mobile',
    cells: [
      cell({ date: '2026-09-05', leadId: 'lead-1', leadTitle: 'Crestline Wedding' }),
      cell({ date: '2026-09-06', serviceable: false }), // closed (weekend)
      cell({ date: '2026-09-07', unitAvailable: false }), // blocked (unit out)
      cell({ date: '2026-09-08' }), // open
    ],
  },
  {
    unitId: 'u2',
    unitName: 'Salon',
    kind: 'venue',
    cells: [
      cell({ date: '2026-09-05' }),
      cell({ date: '2026-09-06', serviceable: false }),
      cell({ date: '2026-09-07' }),
      cell({ date: '2026-09-08' }),
    ],
  },
  {
    unitId: 'unassigned',
    unitName: 'Unassigned',
    kind: 'unassigned',
    cells: [
      cell({ date: '2026-09-05' }),
      cell({ date: '2026-09-06', serviceable: false }),
      cell({ date: '2026-09-07', leadId: 'lead-9', leadTitle: 'Orphan Gala' }),
      cell({ date: '2026-09-08' }),
    ],
  },
]

describe('CapacityOutlookClient — schedule', () => {
  const renderSchedule = (labels?: Org['resource_labels']) =>
    render(
      <CapacityOutlookClient orgSlug="demo" forecast={[month({})]} schedule={scheduleFixture} resourceLabels={labels} />,
    )

  const scheduleRegion = () => screen.getByRole('region', { name: /booked where/i })

  it('shows a unit lane booked cell with the lead title, linking to the opportunity', () => {
    renderSchedule()
    const region = scheduleRegion()
    const links = within(region).getAllByRole('link', { name: /Crestline Wedding/ })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]).toHaveAttribute('href', '/demo/leads/lead-1')
  })

  it('surfaces an unassigned in-window dated lead in the Unassigned lane', () => {
    renderSchedule()
    const region = scheduleRegion()
    expect(within(region).getAllByText(/Unassigned/).length).toBeGreaterThan(0)
    expect(within(region).getAllByText(/Orphan Gala/).length).toBeGreaterThan(0)
  })

  it('flags non-serviceable (closed) and unit-blocked cells distinctly', () => {
    renderSchedule()
    const region = scheduleRegion()
    // A closed day and a blocked day are each communicated in the cell tooltip,
    // not by colour alone.
    expect(within(region).getAllByTitle(/Closed/).length).toBeGreaterThan(0)
    expect(within(region).getAllByTitle(/Unavailable/).length).toBeGreaterThan(0)
  })

  it('groups lanes under kindLabel headers — an org override reads "Carts"', () => {
    renderSchedule({ mobile: { one: 'cart', many: 'carts' } })
    const region = scheduleRegion()
    expect(within(region).getAllByText(/Carts/).length).toBeGreaterThan(0)
  })

  it('uses the neutral group header with no override', () => {
    renderSchedule()
    const region = scheduleRegion()
    expect(within(region).getAllByText(/Serving units/).length).toBeGreaterThan(0)
  })

  it('renders no schedule section when no schedule is passed', () => {
    render(<CapacityOutlookClient orgSlug="demo" forecast={[month({})]} />)
    expect(screen.queryByRole('region', { name: /booked where/i })).toBeNull()
  })
})
