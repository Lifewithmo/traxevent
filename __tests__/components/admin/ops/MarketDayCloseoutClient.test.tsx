import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const saveActualsSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const completeCloseoutSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/actions/event-ops', () => ({
  saveActuals: saveActualsSpy,
  completeCloseout: completeCloseoutSpy,
}))

import { MarketDayCloseoutClient } from '@/components/admin/ops/MarketDayCloseoutClient'

const base = {
  orgId: 'o1',
  eventId: 'e1',
  boothFee: 35,
  closeout: null,
  resources: [],
}

beforeEach(() => vi.clearAllMocks())

describe('MarketDayCloseoutClient', () => {
  it('starts in the prompt state: fee named, net absent, completing gated on sales', () => {
    render(<MarketDayCloseoutClient {...base} />)
    expect(screen.getByText(/the \$35 booth fee comes off the top/i)).toBeInTheDocument()
    expect(screen.queryByText(/today’s net|today's net/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark the day complete' })).toBeDisabled()
    expect(screen.getByText(/even \$0 counts/i)).toBeInTheDocument()
  })

  it('shows the live net as sales are typed — interpreted against the booth fee', () => {
    render(<MarketDayCloseoutClient {...base} />)
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '176' } })
    expect(screen.getByText('$141')).toBeInTheDocument()
    expect(screen.getByText(/after the \$35 booth fee/)).toBeInTheDocument()
  })

  it('calls out a day that did not cover the fee', () => {
    render(<MarketDayCloseoutClient {...base} />)
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '20' } })
    expect(screen.getByText('−$15')).toBeInTheDocument()
    expect(screen.getByText(/didn.t cover the \$35 booth fee/)).toBeInTheDocument()
  })

  it('one tap: Mark complete saves the typed actuals, then completes', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '176' } })
    fireEvent.change(screen.getByLabelText(/waste notes/i), { target: { value: 'dumped 2 gal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark the day complete' }))
    await waitFor(() => expect(completeCloseoutSpy).toHaveBeenCalledWith('o1', 'e1'))
    expect(saveActualsSpy).toHaveBeenCalledWith('o1', 'e1', { sales: 176, waste_notes: 'dumped 2 gal' })
    expect(screen.getByText('Day closed out.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark the day complete' })).not.toBeInTheDocument()
  })

  it('Save without completing records sales but never completes (counting rule)', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '176' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save without completing' }))
    await waitFor(() => expect(saveActualsSpy).toHaveBeenCalledWith('o1', 'e1', { sales: 176 }))
    expect(completeCloseoutSpy).not.toHaveBeenCalled()
    expect(screen.getByText('Saved.')).toBeInTheDocument()
  })

  it('surfaces a failed save visibly with retry copy and re-enables the button', async () => {
    saveActualsSpy.mockRejectedValueOnce(new Error('offline'))
    render(<MarketDayCloseoutClient {...base} />)
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '176' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark the day complete' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/offline.*tap again to retry/i))
    expect(completeCloseoutSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Mark the day complete' })).toBeEnabled()
  })

  it('pre-fills from a saved closeout and shows completed state with Save changes', () => {
    render(
      <MarketDayCloseoutClient
        {...base}
        closeout={{ actuals: { sales: 176, waste_notes: 'n' }, completed: true, created_at: 't' }}
      />
    )
    expect(screen.getByLabelText(/today.s sales/i)).toHaveValue(176)
    expect(screen.getByText('$141')).toBeInTheDocument()
    expect(screen.getByText('Day closed out.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark the day complete' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('handles the no-fee day honestly', () => {
    render(<MarketDayCloseoutClient {...base} boothFee={0} />)
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '176' } })
    expect(screen.getByText('$176')).toBeInTheDocument()
    expect(screen.getByText(/no booth fee on this day/)).toBeInTheDocument()
  })
})
