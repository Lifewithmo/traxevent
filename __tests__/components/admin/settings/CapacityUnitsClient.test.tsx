import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const createCapacityUnit = vi.hoisted(() => vi.fn())
const updateCapacityUnit = vi.hoisted(() => vi.fn())
const deleteCapacityUnit = vi.hoisted(() => vi.fn())
vi.mock('@/actions/capacity', () => ({
  createCapacityUnit,
  updateCapacityUnit,
  deleteCapacityUnit,
  listCapacityUnits: vi.fn(),
}))

import { CapacityUnitsClient } from '@/components/admin/settings/CapacityUnitsClient'
import type { CapacityUnit } from '@/lib/types'

beforeEach(() => vi.clearAllMocks())

function unit(over: Partial<CapacityUnit> & Pick<CapacityUnit, 'id' | 'name' | 'kind'>): CapacityUnit {
  return {
    active: true,
    blockouts: [],
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

const base = { orgId: 'o1' }

function summaryText(): string {
  const el = document.querySelector('[data-slot="capacity-summary"]')
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

describe('CapacityUnitsClient', () => {
  it('groups units by kind under Serving units and Rooms', () => {
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[
          unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' }),
          unit({ id: 'v1', name: 'Room #1', kind: 'venue' }),
        ]}
      />,
    )

    const serving = screen.getByRole('group', { name: /serving units/i })
    const rooms = screen.getByRole('group', { name: /rooms/i })
    expect(within(serving).getByDisplayValue('Kart 1')).toBeInTheDocument()
    expect(within(serving).queryByDisplayValue('Room #1')).not.toBeInTheDocument()
    expect(within(rooms).getByDisplayValue('Room #1')).toBeInTheDocument()
  })

  it('translates inventory into a servable-reality summary line', () => {
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[
          unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' }),
          unit({ id: 'm2', name: 'Kart 2', kind: 'mobile' }),
          unit({ id: 'm3', name: 'Kart 3', kind: 'mobile' }),
          unit({ id: 'v1', name: 'Room #1', kind: 'venue' }),
          unit({ id: 'v2', name: 'Room #2', kind: 'venue' }),
        ]}
      />,
    )

    expect(summaryText()).toMatch(/^You can serve up to 3 events a day .* 2 of them on-site\.$/)
  })

  it('excludes retired units from the servable-reality count', () => {
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[
          unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' }),
          unit({ id: 'm2', name: 'Kart 2', kind: 'mobile', active: false }),
          unit({ id: 'v1', name: 'Room #1', kind: 'venue' }),
        ]}
      />,
    )
    // 1 active mobile (not 2), 1 venue.
    expect(summaryText()).toMatch(/^You can serve up to 1 event a day .* 1 of them on-site\.$/)
  })

  it('shows an onboarding empty state, not a blank void, when there are no units', () => {
    render(<CapacityUnitsClient {...base} initialUnits={[]} />)
    expect(screen.getByText(/pipeline uses this to know when you're overbooked/i)).toBeInTheDocument()
    // No summary line for an empty inventory.
    expect(screen.queryByText(/you can serve up to/i)).not.toBeInTheDocument()
  })

  it('creates a serving unit through createCapacityUnit', async () => {
    const user = userEvent.setup()
    createCapacityUnit.mockResolvedValue(unit({ id: 'new', name: 'Kart 9', kind: 'mobile' }))
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /add serving unit/i }))
    await user.type(screen.getByLabelText('New serving unit name'), 'Kart 9')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(createCapacityUnit).toHaveBeenCalledWith('o1', { name: 'Kart 9', kind: 'mobile' }),
    )
    expect(await screen.findByDisplayValue('Kart 9')).toBeInTheDocument()
  })

  it('retires a unit through updateCapacityUnit with active:false', async () => {
    updateCapacityUnit.mockResolvedValue(undefined)
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
      />,
    )

    fireEvent.click(screen.getByRole('switch', { name: /active/i }))
    await waitFor(() =>
      expect(updateCapacityUnit).toHaveBeenCalledWith('o1', 'm1', { active: false }),
    )
  })

  it('renders block-outs as removable date-range chips and removes through updateCapacityUnit', async () => {
    updateCapacityUnit.mockResolvedValue(undefined)
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[
          unit({
            id: 'm1',
            name: 'Kart 1',
            kind: 'mobile',
            blockouts: [{ start: '2026-08-20', end: '2026-08-22', note: 'maintenance' }],
          }),
        ]}
      />,
    )

    // The formatted range rides on the remove button's accessible name; the note is visible too.
    expect(screen.getByRole('button', { name: /remove block-out Aug 20.22/i })).toBeInTheDocument()
    expect(screen.getByText(/maintenance/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /remove block-out/i }))
    await waitFor(() =>
      expect(updateCapacityUnit).toHaveBeenCalledWith('o1', 'm1', { blockouts: [] }),
    )
  })

  it('shows an honest upsell panel and no editor when locked', () => {
    render(
      <CapacityUnitsClient
        {...base}
        locked
        initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
      />,
    )
    expect(screen.getByText(/business[- ]plan feature/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add serving unit/i })).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Kart 1')).not.toBeInTheDocument()
  })
})
