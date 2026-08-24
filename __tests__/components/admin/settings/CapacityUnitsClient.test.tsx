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

const updateServiceableDays = vi.hoisted(() => vi.fn())
const updateResourceLabels = vi.hoisted(() => vi.fn())
const updateEventTypeProfiles = vi.hoisted(() => vi.fn())
vi.mock('@/actions/capacity-config', () => ({
  updateServiceableDays,
  updateResourceLabels,
  updateEventTypeProfiles,
}))

const updateOpsBuffers = vi.hoisted(() => vi.fn())
vi.mock('@/actions/ops-buffers', () => ({
  updateOpsBuffers,
}))

import { CapacityUnitsClient } from '@/components/admin/settings/CapacityUnitsClient'
import { MAX_BUFFER_MINUTES } from '@/lib/event-ui'
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

  it('clamps the on-site figure to the serving-unit count (rooms cannot exceed carts)', () => {
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[
          unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' }),
          unit({ id: 'm2', name: 'Kart 2', kind: 'mobile' }),
          unit({ id: 'v1', name: 'Room #1', kind: 'venue' }),
          unit({ id: 'v2', name: 'Room #2', kind: 'venue' }),
          unit({ id: 'v3', name: 'Room #3', kind: 'venue' }),
          unit({ id: 'v4', name: 'Room #4', kind: 'venue' }),
          unit({ id: 'v5', name: 'Room #5', kind: 'venue' }),
        ]}
      />,
    )
    // 2 carts, 5 rooms → still only 2 events/day, and at most 2 can be on-site
    // (every event also needs a cart). NOT "5 of them on-site".
    expect(summaryText()).toMatch(/^You can serve up to 2 events a day .* 2 of them on-site\.$/)
  })

  it('excludes a retired ROOM from the on-site figure', () => {
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[
          unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' }),
          unit({ id: 'm2', name: 'Kart 2', kind: 'mobile' }),
          unit({ id: 'v1', name: 'Room #1', kind: 'venue' }),
          unit({ id: 'v2', name: 'Room #2', kind: 'venue', active: false }),
        ]}
      />,
    )
    // 2 carts, 1 ACTIVE room → 2 events/day, 1 on-site (the retired room drops out).
    expect(summaryText()).toMatch(/^You can serve up to 2 events a day .* 1 of them on-site\.$/)
  })

  it('shows an onboarding empty state, not a blank void, when there are no units', () => {
    render(<CapacityUnitsClient {...base} initialUnits={[]} />)
    // The noun is label-driven (neutral default), not a hardcoded literal.
    expect(
      screen.getByText(/Add your first serving unit — the pipeline uses this to know when you're overbooked\./i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/cart/i)).not.toBeInTheDocument()
    // No summary line for an empty inventory.
    expect(screen.queryByText(/you can serve up to/i)).not.toBeInTheDocument()
  })

  it('routes the empty-state noun through the org resource label', () => {
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[]}
        initialResourceLabels={{ mobile: { one: 'trailer', many: 'trailers' } }}
      />,
    )
    expect(
      screen.getByText(/Add your first trailer — the pipeline uses this to know when you're overbooked\./i),
    ).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('switch', { name: /Kart 1 — active/i }))
    await waitFor(() =>
      expect(updateCapacityUnit).toHaveBeenCalledWith('o1', 'm1', { active: false }),
    )
  })

  it('gives each unit switch a distinct, unit-scoped accessible name', () => {
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[
          unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' }),
          unit({ id: 'm2', name: 'Kart 2', kind: 'mobile', active: false }),
        ]}
      />,
    )
    // Screen-reader users must be able to tell which unit each switch controls.
    expect(screen.getByRole('switch', { name: /Kart 1 — active/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Kart 2 — retired/i })).toBeInTheDocument()
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

  it('validates the block-out add form: start-after-end is rejected, a valid range persists', async () => {
    updateCapacityUnit.mockResolvedValue(undefined)
    render(
      <CapacityUnitsClient
        {...base}
        initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /\+ add block-out/i }))
    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')

    // start AFTER end → inline error, nothing persisted.
    fireEvent.change(from, { target: { value: '2026-09-12' } })
    fireEvent.change(to, { target: { value: '2026-09-10' } })
    fireEvent.click(screen.getByRole('button', { name: /^add block-out$/i }))
    expect(screen.getByText(/start date must be on or before the end date/i)).toBeInTheDocument()
    expect(updateCapacityUnit).not.toHaveBeenCalled()

    // fix the range → the appended block-out persists.
    fireEvent.change(to, { target: { value: '2026-09-14' } })
    fireEvent.click(screen.getByRole('button', { name: /^add block-out$/i }))
    await waitFor(() =>
      expect(updateCapacityUnit).toHaveBeenCalledWith('o1', 'm1', {
        blockouts: [{ start: '2026-09-12', end: '2026-09-14' }],
      }),
    )
  })

  describe('When you\'re open — serviceable days', () => {
    it('defaults every weekday on and toggles one off through updateServiceableDays', async () => {
      updateServiceableDays.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
        />,
      )

      // All seven pills start pressed (absent config ⇒ all-on).
      expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Wednesday' })).toHaveAttribute('aria-pressed', 'true')

      fireEvent.click(screen.getByRole('button', { name: 'Sunday' }))
      await waitFor(() =>
        expect(updateServiceableDays).toHaveBeenCalledWith('o1', {
          weekdays: [1, 2, 3, 4, 5, 6],
          closures: [],
        }),
      )
      expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('warns when every day is marked closed', async () => {
      updateServiceableDays.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialServiceableDays={{ weekdays: [0] }}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
        />,
      )

      // Only Sunday on, no warning yet.
      expect(screen.queryByText(/marked every day closed/i)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Sunday' }))
      expect(await screen.findByText(/marked every day closed/i)).toBeInTheDocument()
      await waitFor(() =>
        expect(updateServiceableDays).toHaveBeenCalledWith('o1', { weekdays: [], closures: [] }),
      )
    })

    it('adds a closure range and persists it through updateServiceableDays', async () => {
      updateServiceableDays.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /\+ add closure/i }))
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-24' } })
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-26' } })
      fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'Holiday' } })
      fireEvent.click(screen.getByRole('button', { name: /^add closure$/i }))

      await waitFor(() =>
        expect(updateServiceableDays).toHaveBeenCalledWith('o1', {
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          closures: [{ start: '2026-12-24', end: '2026-12-26', note: 'Holiday' }],
        }),
      )
      // The chip renders and is removable.
      expect(screen.getByRole('button', { name: /remove closure Dec 24.26/i })).toBeInTheDocument()
    })
  })

  describe('Resource labels — editable category names', () => {
    it('defaults to neutral category headers when no labels are set', () => {
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[
            unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' }),
            unit({ id: 'v1', name: 'Room #1', kind: 'venue' }),
          ]}
        />,
      )
      expect(screen.getByRole('group', { name: 'Serving units' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Rooms' })).toBeInTheDocument()
    })

    it('renders operator overrides as the category header', () => {
      render(
        <CapacityUnitsClient
          {...base}
          initialResourceLabels={{ mobile: { one: 'cart', many: 'carts' } }}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
        />,
      )
      expect(screen.getByRole('group', { name: 'Carts' })).toBeInTheDocument()
    })

    it('edits a kind label through updateResourceLabels', async () => {
      const user = userEvent.setup()
      updateResourceLabels.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
        />,
      )

      await user.click(screen.getByRole('button', { name: /rename serving units category/i }))
      const singular = screen.getByLabelText('Singular')
      const plural = screen.getByLabelText('Plural')
      await user.clear(singular)
      await user.type(singular, 'Cart')
      await user.clear(plural)
      await user.type(plural, 'Carts')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() =>
        expect(updateResourceLabels).toHaveBeenCalledWith('o1', {
          mobile: { one: 'Cart', many: 'Carts' },
        }),
      )
      // The header adopts the new plural.
      expect(screen.getByRole('group', { name: 'Carts' })).toBeInTheDocument()
    })
  })

  describe('Event types — per-type resource profiles', () => {
    it('always states the default rule in a hint line, routed through the operator label', () => {
      render(
        <CapacityUnitsClient
          {...base}
          initialResourceLabels={{ mobile: { one: 'cart', many: 'carts' }, venue: { one: 'room', many: 'rooms' } }}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
        />,
      )
      // The default is legible even with no profiles listed: an unlisted type
      // falls back to a cart always + a room when on-site.
      expect(
        screen.getByText(/Types not listed use the default — a cart always, a room when on-site\./i),
      ).toBeInTheDocument()
    })

    it('renders each profile as a row: a name plus two kind toggles', () => {
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
          initialEventTypeProfiles={[{ name: 'Wedding', needsMobile: true, needsVenue: false }]}
        />,
      )
      expect(screen.getByDisplayValue('Wedding')).toBeInTheDocument()
      const mobileToggle = screen.getByRole('button', { name: /Wedding — needs serving unit/i })
      const venueToggle = screen.getByRole('button', { name: /Wedding — needs room/i })
      expect(mobileToggle).toHaveAttribute('aria-pressed', 'true')
      expect(venueToggle).toHaveAttribute('aria-pressed', 'false')
    })

    it('toggling a kind persists the flipped profile through updateEventTypeProfiles', async () => {
      updateEventTypeProfiles.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
          initialEventTypeProfiles={[{ name: 'Wedding', needsMobile: true, needsVenue: false }]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Wedding — needs room/i }))
      await waitFor(() =>
        expect(updateEventTypeProfiles).toHaveBeenCalledWith('o1', [
          { name: 'Wedding', needsMobile: true, needsVenue: true },
        ]),
      )
      expect(screen.getByRole('button', { name: /Wedding — needs room/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('adds an event type through updateEventTypeProfiles', async () => {
      const user = userEvent.setup()
      updateEventTypeProfiles.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
        />,
      )

      await user.click(screen.getByRole('button', { name: /add event type/i }))
      await user.type(screen.getByLabelText(/event type name/i), 'Photo package')
      // A photo shoot needs neither a serving unit nor a room — turn the default off.
      await user.click(screen.getByRole('button', { name: /needs serving unit/i }))
      await user.click(screen.getByRole('button', { name: /^add$/i }))

      await waitFor(() =>
        expect(updateEventTypeProfiles).toHaveBeenCalledWith('o1', [
          { name: 'Photo package', needsMobile: false, needsVenue: false },
        ]),
      )
      expect(await screen.findByDisplayValue('Photo package')).toBeInTheDocument()
    })

    it('removes an event type through updateEventTypeProfiles', async () => {
      updateEventTypeProfiles.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
          initialEventTypeProfiles={[
            { name: 'Wedding', needsMobile: true, needsVenue: false },
            { name: 'Gala', needsMobile: true, needsVenue: true },
          ]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /remove event type Wedding/i }))
      await waitFor(() =>
        expect(updateEventTypeProfiles).toHaveBeenCalledWith('o1', [
          { name: 'Gala', needsMobile: true, needsVenue: true },
        ]),
      )
    })

    it('renames an event type on blur through updateEventTypeProfiles', async () => {
      updateEventTypeProfiles.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[unit({ id: 'm1', name: 'Kart 1', kind: 'mobile' })]}
          initialEventTypeProfiles={[{ name: 'Wedding', needsMobile: true, needsVenue: false }]}
        />,
      )

      const input = screen.getByDisplayValue('Wedding')
      fireEvent.change(input, { target: { value: 'Reception' } })
      fireEvent.blur(input)
      await waitFor(() =>
        expect(updateEventTypeProfiles).toHaveBeenCalledWith('o1', [
          { name: 'Reception', needsMobile: true, needsVenue: false },
        ]),
      )
    })
  })

  describe('Day-of timing — pack/drive buffers', () => {
    it('renders both fields with the defaults as placeholders and the helper copy', () => {
      render(<CapacityUnitsClient {...base} initialUnits={[]} />)
      expect(screen.getByLabelText('Pack time (minutes)')).toHaveAttribute('placeholder', '45')
      expect(screen.getByLabelText('Drive time (minutes)')).toHaveAttribute('placeholder', '30')
      expect(
        screen.getByText(/on job briefs and run sheets — leave blank for the 45m\/30m defaults/i),
      ).toBeInTheDocument()
    })

    it('persists an edited pack time on blur, sending the full merged scalar', async () => {
      updateOpsBuffers.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[]}
          initialOpsBuffers={{ drive_minutes: 20 }}
        />,
      )

      const packInput = screen.getByLabelText('Pack time (minutes)')
      fireEvent.change(packInput, { target: { value: '50' } })
      fireEvent.blur(packInput)
      // Both keys ride along — the action replaces the whole ops_buffers scalar.
      await waitFor(() =>
        expect(updateOpsBuffers).toHaveBeenCalledWith('o1', {
          pack_minutes: 50,
          drive_minutes: 20,
        }),
      )
    })

    it('a blanked field CLEARS its key (back to the constant default)', async () => {
      updateOpsBuffers.mockResolvedValue(undefined)
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[]}
          initialOpsBuffers={{ pack_minutes: 50, drive_minutes: 20 }}
        />,
      )

      const packInput = screen.getByLabelText('Pack time (minutes)')
      fireEvent.change(packInput, { target: { value: '' } })
      fireEvent.blur(packInput)
      await waitFor(() =>
        expect(updateOpsBuffers).toHaveBeenCalledWith('o1', { drive_minutes: 20 }),
      )
      const payload = updateOpsBuffers.mock.calls[0][1] as Record<string, unknown>
      expect('pack_minutes' in payload).toBe(false)
    })

    it('rejects an out-of-range value inline and does NOT save — ceiling and copy come from the SHARED constant', async () => {
      render(<CapacityUnitsClient {...base} initialUnits={[]} />)

      const packInput = screen.getByLabelText('Pack time (minutes)')
      fireEvent.change(packInput, { target: { value: String(MAX_BUFFER_MINUTES + 1) } })
      fireEvent.blur(packInput)
      // The error copy interpolates lib/event-ui's MAX_BUFFER_MINUTES — the
      // same bound the server action enforces — so raising the ceiling
      // server-side can never leave the client asserting a stale one.
      expect(
        await screen.findByText(new RegExp(`whole number between 1 and ${MAX_BUFFER_MINUTES}`, 'i')),
      ).toBeInTheDocument()
      expect(updateOpsBuffers).not.toHaveBeenCalled()
      // The boundary itself is accepted client-side (matches the action's 1..MAX).
      fireEvent.change(packInput, { target: { value: String(MAX_BUFFER_MINUTES) } })
      fireEvent.blur(packInput)
      await waitFor(() =>
        expect(updateOpsBuffers).toHaveBeenCalledWith('o1', { pack_minutes: MAX_BUFFER_MINUTES }),
      )
    })

    it('both inputs carry the shared ceiling as their max attribute', () => {
      render(<CapacityUnitsClient {...base} initialUnits={[]} />)
      expect(screen.getByLabelText('Pack time (minutes)')).toHaveAttribute('max', String(MAX_BUFFER_MINUTES))
      expect(screen.getByLabelText('Drive time (minutes)')).toHaveAttribute('max', String(MAX_BUFFER_MINUTES))
    })

    it('reverts the fields and surfaces the error when the action fails', async () => {
      updateOpsBuffers.mockRejectedValue(new Error('Forbidden'))
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[]}
          initialOpsBuffers={{ pack_minutes: 50 }}
        />,
      )

      const packInput = screen.getByLabelText('Pack time (minutes)')
      fireEvent.change(packInput, { target: { value: '60' } })
      fireEvent.blur(packInput)
      expect(await screen.findByText('Forbidden')).toBeInTheDocument()
      expect(packInput).toHaveValue(50)
    })

    it('does not call the action when nothing changed', async () => {
      render(
        <CapacityUnitsClient
          {...base}
          initialUnits={[]}
          initialOpsBuffers={{ pack_minutes: 50 }}
        />,
      )
      const packInput = screen.getByLabelText('Pack time (minutes)')
      fireEvent.blur(packInput)
      await waitFor(() => expect(updateOpsBuffers).not.toHaveBeenCalled())
    })

    it('stays reachable on the locked (business-tier upsell) surface', () => {
      // Buffers power job briefs / run sheets — NOT the gated multi-resource
      // feature — so a solo operator below the business tier can still set them.
      render(<CapacityUnitsClient {...base} locked initialUnits={[]} />)
      expect(screen.getByText(/business[- ]plan feature/i)).toBeInTheDocument()
      expect(screen.getByLabelText('Pack time (minutes)')).toBeInTheDocument()
      expect(screen.getByLabelText('Drive time (minutes)')).toBeInTheDocument()
    })
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
