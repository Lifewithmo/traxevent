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
  eventDate: '2026-08-22', // a Saturday
  closeout: null,
  resources: [],
}

// A realistic Square Transactions-CSV covering the event date and a stray
// prior day (which must be filtered out of the prefill).
const SQUARE_CSV = [
  'Date,Time,Time Zone,Gross Sales,Discounts,Net Sales,Tax,Tip,Total Collected,Payment Method',
  '8/21/2026,17:00:00,MDT,$99.00,$0.00,$99.00,$0.00,$0.00,$99.00,Card',
  '8/22/2026,09:14:03,MDT,"$1,240.00",$0.00,"$1,240.00",$0.00,$3.50,"$1,243.50",Card',
  '8/22/2026,09:31:44,MDT,$4.50,$0.00,$4.50,$0.27,$0.00,$4.77,Cash',
].join('\n')

function attachCsv(content: string) {
  const input = screen.getByLabelText(/attach square export/i)
  const file = new File([content], 'transactions.csv', { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [file] } })
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
    expect(saveActualsSpy).toHaveBeenCalledWith('o1', 'e1', { sales: 176, sales_source: 'manual', waste_notes: 'dumped 2 gal' })
    expect(screen.getByText('Day closed out.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark the day complete' })).not.toBeInTheDocument()
  })

  it('Save without completing records sales but never completes (counting rule)', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '176' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save without completing' }))
    await waitFor(() => expect(saveActualsSpy).toHaveBeenCalledWith('o1', 'e1', { sales: 176, sales_source: 'manual' }))
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

describe('Square CSV prefill (inc-3 S2, BINDING B4)', () => {
  // Flow budget asserted here (B4, honest): tap 1 = Attach (the OS file pick
  // rides on it), tap 2 = Mark the day complete. Nothing else — the evidence
  // caption is the confirmation, there is no modal to dismiss.
  it('attach → evidence caption → complete: 2 in-app taps, provenance = square_csv', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    attachCsv(SQUARE_CSV) // tap 1 (+ the OS file pick)
    // Prefill filtered to the event date: 1243.50 + 4.77, the 8/21 row excluded.
    await waitFor(() =>
      expect(screen.getByLabelText(/today.s sales/i)).toHaveValue(1248.27))
    // The caption IS the confirmation (no modal): date · rows · gross.
    expect(screen.getByText('Sat Aug 22 · 2 payments · $1,248.27 Total Collected (gross)')).toBeInTheDocument()
    // The live net keeps working off the prefilled figure.
    expect(screen.getByText(/after the \$35 booth fee/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark the day complete' })) // tap 2
    await waitFor(() => expect(completeCloseoutSpy).toHaveBeenCalledWith('o1', 'e1'))
    expect(saveActualsSpy).toHaveBeenCalledWith('o1', 'e1', { sales: 1248.27, sales_source: 'square_csv' })
  })

  it('a manual edit after a prefill flips provenance back to manual and drops the caption', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    attachCsv(SQUARE_CSV)
    await waitFor(() => expect(screen.getByLabelText(/today.s sales/i)).toHaveValue(1248.27))
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '1250' } })
    // The evidence caption attested to a figure no longer shown — it must go.
    expect(screen.queryByText(/Total Collected \(gross\)/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save without completing' }))
    await waitFor(() =>
      expect(saveActualsSpy).toHaveBeenCalledWith('o1', 'e1', { sales: 1250, sales_source: 'manual' }))
  })

  it('fails designed on a non-Transactions export — field untouched, no caption', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '176' } })
    attachCsv('Sales,Amount\nGross Sales,"$1,240.00"')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Couldn.t read this export — choose the Transactions CSV from Square.s dashboard/))
    expect(screen.getByLabelText(/today.s sales/i)).toHaveValue(176) // never clobbered
    expect(screen.queryByText(/Total Collected \(gross\)/)).not.toBeInTheDocument()
  })

  it('a day netting negative fails DESIGNED — field untouched, refund-check copy, no caption (D6)', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '176' } })
    attachCsv([
      'Date,Total Collected',
      '8/22/2026,$10.00',
      '8/22/2026,-$25.00',
    ].join('\n'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This export nets negative for that date — check refunds in Square; enter the figure manually.'))
    // Never a prefill the screen can't save: the typed figure survives.
    expect(screen.getByLabelText(/today.s sales/i)).toHaveValue(176)
    expect(screen.queryByText(/Total Collected \(gross\)/)).not.toBeInTheDocument()
  })

  it('names the missing day when the export covers other dates', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    attachCsv([
      'Date,Total Collected',
      '8/21/2026,$99.00',
    ].join('\n'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/No Sat Aug 22 rows in this export/))
  })

  it('discloses refunds in the caption (refunds subtract — documented in lib/square-csv.ts)', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    attachCsv([
      'Date,Total Collected',
      '8/22/2026,$50.00',
      '8/22/2026,-$5.00',
    ].join('\n'))
    await waitFor(() =>
      expect(screen.getByText('Sat Aug 22 · 1 payment − 1 refund · $45.00 Total Collected (gross)')).toBeInTheDocument())
    expect(screen.getByLabelText(/today.s sales/i)).toHaveValue(45)
  })

  it('surfaces a currency warning without blocking the prefill', async () => {
    render(<MarketDayCloseoutClient {...base} />)
    attachCsv([
      'Date,Total Collected',
      '8/22/2026,"€1.234,56"',
    ].join('\n'))
    await waitFor(() => expect(screen.getByLabelText(/today.s sales/i)).toHaveValue(1234.56))
    expect(screen.getByText(/Amounts appear in €/)).toBeInTheDocument()
  })

  it('a reloaded imported figure stays labeled (B3: provenance is a field, not a caption)', () => {
    render(
      <MarketDayCloseoutClient
        {...base}
        closeout={{ actuals: { sales: 1248.27, sales_source: 'square_csv' }, completed: true, created_at: 't' }}
      />
    )
    expect(screen.getByText('Imported from a Square export.')).toBeInTheDocument()
  })

  it('typing over a reloaded import saves it back as manual (provenance honesty)', async () => {
    render(
      <MarketDayCloseoutClient
        {...base}
        closeout={{ actuals: { sales: 1248.27, sales_source: 'square_csv' }, completed: false, created_at: 't' }}
      />
    )
    fireEvent.change(screen.getByLabelText(/today.s sales/i), { target: { value: '1300' } })
    expect(screen.queryByText('Imported from a Square export.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save without completing' }))
    await waitFor(() =>
      expect(saveActualsSpy).toHaveBeenCalledWith('o1', 'e1', { sales: 1300, sales_source: 'manual' }))
  })
})

describe('ghost hint (B4: series prior day, when in reach)', () => {
  it('renders "Last Saturday: $180" for a same-weekday prior day within a week', () => {
    render(<MarketDayCloseoutClient {...base} priorDay={{ date: '2026-08-15', sales: 180 }} />)
    expect(screen.getByText('Last Saturday: $180')).toBeInTheDocument()
  })

  it('uses the dated form when the prior day is further back', () => {
    render(<MarketDayCloseoutClient {...base} priorDay={{ date: '2026-08-08', sales: 180 }} />)
    expect(screen.getByText('Last market day (Aug 8): $180')).toBeInTheDocument()
  })

  // D4 (B3 hard gate): imported money is labeled as imported at EVERY render
  // — the ghost hint included. Same idiom as SeriesClient's importedMark:
  // fine-print " · Square" with the title naming the source.
  it('marks an imported prior-day figure with the season strip’s Square idiom', () => {
    render(
      <MarketDayCloseoutClient
        {...base}
        priorDay={{ date: '2026-08-15', sales: 180, imported: true }}
      />
    )
    const hint = screen.getByText(/Last Saturday: \$180/)
    expect(hint).toHaveTextContent('Last Saturday: $180 · Square')
    expect(screen.getByTitle('Sales imported from a Square export')).toHaveTextContent('· Square')
  })

  it('a manually-recorded prior day carries NO imported mark', () => {
    render(
      <MarketDayCloseoutClient
        {...base}
        priorDay={{ date: '2026-08-15', sales: 180, imported: false }}
      />
    )
    expect(screen.getByText('Last Saturday: $180')).toBeInTheDocument()
    expect(screen.queryByText(/· Square/)).not.toBeInTheDocument()
    expect(screen.queryByTitle('Sales imported from a Square export')).not.toBeInTheDocument()
  })

  it('is absent without prior-day data, and yields to the evidence caption after a prefill', async () => {
    const { unmount } = render(<MarketDayCloseoutClient {...base} />)
    expect(screen.queryByText(/^Last /)).not.toBeInTheDocument()
    unmount()
    render(<MarketDayCloseoutClient {...base} priorDay={{ date: '2026-08-15', sales: 180 }} />)
    attachCsv(SQUARE_CSV)
    await waitFor(() => expect(screen.getByText(/Total Collected \(gross\)/)).toBeInTheDocument())
    expect(screen.queryByText('Last Saturday: $180')).not.toBeInTheDocument()
  })
})
