import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/event-ops', () => ({
  instantiateOpsPlan: vi.fn().mockResolvedValue({ package_ids: ['p1'], needs_review: false }),
}))

import { instantiateOpsPlan } from '@/actions/event-ops'
import { OpsSetup } from '@/components/admin/ops/OpsSetup'
import type { WorkPackage } from '@/lib/types'

const pkg: WorkPackage = {
  id: 'p1', name: 'Espresso Bar', price: 900, lines: [],
  created_at: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('OpsSetup', () => {
  it('instantiates with selected packages, guests, and site needs', async () => {
    const onCreated = vi.fn()
    render(
      <OpsSetup orgId="o1" eventId="e1" packages={[pkg]} eventStart="2026-09-10T00:00:00.000Z"
        industryPackId="coffee-cart" defaultGuests={80} onCreated={onCreated} />
    )
    fireEvent.click(screen.getByLabelText('Espresso Bar'))
    fireEvent.click(screen.getByLabelText('power'))
    fireEvent.click(screen.getByRole('button', { name: 'Set up ops plan' }))
    await waitFor(() => expect(instantiateOpsPlan).toHaveBeenCalledWith('o1', 'e1', {
      package_ids: ['p1'],
      requirements: { guests: 80, site_needs: ['power'] },
      event_start: '2026-09-10T00:00:00.000Z',
      industry_pack_id: 'coffee-cart',
    }))
    expect(onCreated).toHaveBeenCalled()
  })

  it('requires at least one package and a positive guest count', () => {
    render(<OpsSetup orgId="o1" eventId="e1" packages={[pkg]} eventStart="2026-09-10" onCreated={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Set up ops plan' })).toBeDisabled()
  })

  it('surfaces the already-exists error actionably', async () => {
    vi.mocked(instantiateOpsPlan).mockRejectedValueOnce(new Error('Ops plan already exists for this event'))
    render(<OpsSetup orgId="o1" eventId="e1" packages={[pkg]} eventStart="2026-09-10" defaultGuests={10} onCreated={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Espresso Bar'))
    fireEvent.click(screen.getByRole('button', { name: 'Set up ops plan' }))
    expect(await screen.findByText(/already exists.*reload/i)).toBeInTheDocument()
  })
})
