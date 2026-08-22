import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { RunwayStrip } from '@/components/admin/calendar/RunwayStrip'
import type { RunwayContribution, RunwayJob } from '@/lib/calendar-cashflow'

const contribution = (o: Partial<RunwayContribution> = {}): RunwayContribution => ({
  invoiceId: 'inv1',
  title: 'Deposit',
  amount: 5000,
  dueDate: '2026-08-20',
  aging: 'current',
  overdue: false,
  timing: 'before',
  href: '/acme/leads/L1/invoices/inv1',
  ...o,
})

const job = (o: Partial<RunwayJob> = {}): RunwayJob => ({
  eventId: 'e1',
  title: 'Alder wedding',
  date: '2026-08-22',
  inflowBefore: 8000,
  dueAfter: 2000,
  contributions: [],
  overdueBefore: 0,
  billing: 'outstanding',
  untimedOwed: 0,
  leadId: 'L1',
  boothFee: 0,
  carriedIn: 0,
  cashIn: 8000,
  cumulative: 8000,
  firstShortfall: false,
  ...o,
})

const jobs: RunwayJob[] = [
  job(),
  job({ eventId: 'e2', title: 'Mission gala', date: '2026-09-05', inflowBefore: 0, dueAfter: 5000, leadId: 'L2', carriedIn: 8000, cashIn: 0, cumulative: 8000 }),
]

describe('RunwayStrip', () => {
  it('lists upcoming booked jobs with the receivables landing before each', () => {
    render(<RunwayStrip orgSlug="acme" runway={jobs} />)
    expect(screen.getByText('Alder wedding')).toBeInTheDocument()
    expect(screen.getAllByText('$8,000').length).toBeGreaterThan(0)
    // receivables-timing wording — "before this job", never "profit"/"P&L".
    expect(screen.getAllByText(/before this job/i).length).toBeGreaterThan(0)
  })

  it('labels the strip as receivables timing, never profit or P&L', () => {
    const { container } = render(<RunwayStrip orgSlug="acme" runway={jobs} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/profit/i)
    expect(text).not.toMatch(/P&L/i)
    // it must name what the number is — money owed / expected to land.
    expect(text).toMatch(/expected|owed|lands|before/i)
  })

  it('links each row title to that job’s day, preserving params via dayHref', () => {
    render(
      <RunwayStrip
        orgSlug="acme"
        runway={jobs}
        dayHref={(ymd) => `/acme/calendar/${ymd}?view=week&kinds=pipeline`}
      />
    )
    const row = screen.getByText('Alder wedding').closest('a')!
    expect(row).toHaveAttribute('href', '/acme/calendar/2026-08-22?view=week&kinds=pipeline')
  })

  it('defaults each row link to the plain day route when no dayHref is given', () => {
    render(<RunwayStrip orgSlug="acme" runway={jobs} />)
    const row = screen.getByText('Mission gala').closest('a')!
    expect(row).toHaveAttribute('href', '/acme/calendar/2026-09-05')
  })

  it('renders a single specific CTA when there are no booked jobs ahead', () => {
    render(<RunwayStrip orgSlug="acme" runway={[]} />)
    expect(screen.getByText(/no booked jobs ahead/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open (the )?pipeline/i })).toHaveAttribute('href', '/acme/leads')
  })

  it('caps the visible rows and gives the remainder a real destination', () => {
    const many: RunwayJob[] = Array.from({ length: 8 }, (_, i) =>
      job({ eventId: `e${i}`, title: `Job ${i}`, date: `2026-09-0${(i % 9) + 1}`, inflowBefore: 100 * i })
    )
    render(<RunwayStrip orgSlug="acme" runway={many} />)
    // Miller: keep the visible list to a scannable few.
    const list = screen.getByRole('list', { name: /runway/i })
    expect(within(list).getAllByRole('listitem').length).toBeLessThanOrEqual(5)
    // …and the tail is a LINK to the full book, not a dead-end <p>.
    const more = screen.getByRole('link', { name: /\+3 more/i })
    expect(more).toHaveAttribute('href', '/acme/calendar?view=agenda')
  })

  // ── Showing its work ───────────────────────────────────────────────────────

  describe('the build-up behind the number', () => {
    const withContributions = [
      job({
        contributions: [
          contribution({ invoiceId: 'inv1', title: 'Deposit', amount: 5000 }),
          contribution({ invoiceId: 'inv2', title: 'Balance 1041', amount: 3000, dueDate: '2026-08-21', href: '/acme/leads/L1/invoices/inv2' }),
          contribution({ invoiceId: 'inv3', title: 'Final', amount: 2000, dueDate: '2026-09-01', timing: 'after', href: '/acme/leads/L1/invoices/inv3' }),
        ],
      }),
    ]

    it('hides the detail until asked, with a keyboard-operable disclosure', () => {
      render(<RunwayStrip orgSlug="acme" runway={withContributions} />)
      const toggle = screen.getByRole('button', { name: /alder wedding/i })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      const panelId = toggle.getAttribute('aria-controls')!
      expect(panelId).toBeTruthy()
      expect(document.getElementById(panelId)).toBeNull()
      expect(screen.queryByText('Balance 1041')).not.toBeInTheDocument()

      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      // the panel the control names actually exists once open
      expect(document.getElementById(panelId)).not.toBeNull()
    })

    it('shows the actual invoices behind the figure, each linked to its own record', () => {
      render(<RunwayStrip orgSlug="acme" runway={withContributions} />)
      fireEvent.click(screen.getByRole('button', { name: /alder wedding/i }))
      expect(screen.getByRole('link', { name: /Balance 1041/ })).toHaveAttribute(
        'href',
        '/acme/leads/L1/invoices/inv2'
      )
      expect(screen.getByRole('link', { name: /Deposit/ })).toHaveAttribute(
        'href',
        '/acme/leads/L1/invoices/inv1'
      )
      // the after-the-job side is labelled, not silently mixed in
      expect(screen.getByText(/due after the job/i)).toBeInTheDocument()
    })

    it('shows the arithmetic behind the running balance', () => {
      render(
        <RunwayStrip
          orgSlug="acme"
          runway={[job({ carriedIn: 1000, cashIn: 8000, boothFee: 150, cumulative: 8850, contributions: [contribution()] })]}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /alder wedding/i }))
      expect(screen.getByText(/carried in/i)).toBeInTheDocument()
      expect(screen.getByText('$1,000')).toBeInTheDocument()
      expect(screen.getByText('+$8,000')).toBeInTheDocument()
      // the committed cost is named as a cost and shown subtracting
      expect(screen.getByText(/booth fee/i)).toBeInTheDocument()
      expect(screen.getByText('−$150')).toBeInTheDocument()
    })

    it('flags the overdue share of an “expected to land” figure', () => {
      render(<RunwayStrip orgSlug="acme" runway={[job({ inflowBefore: 8000, overdueBefore: 5000 })]} />)
      expect(screen.getByText(/already overdue/i)).toBeInTheDocument()
      expect(screen.getByText('$5,000')).toBeInTheDocument()
    })

    it('discloses money that carries no due date rather than dropping it', () => {
      render(<RunwayStrip orgSlug="acme" runway={[job({ untimedOwed: 900 })]} />)
      fireEvent.click(screen.getByRole('button', { name: /alder wedding/i }))
      expect(screen.getByText(/no due\s*date/i)).toBeInTheDocument()
      expect(screen.getByText('$900')).toBeInTheDocument()
    })
  })

  // ── The honest zero ────────────────────────────────────────────────────────

  describe('a zero is not one thing', () => {
    it('reads a COLLECTED job as settled, with nothing to do', () => {
      render(
        <RunwayStrip
          orgSlug="acme"
          runway={[job({ inflowBefore: 0, dueAfter: 0, billing: 'collected' })]}
        />
      )
      expect(screen.getByText(/paid in full/i)).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /bill this job/i })).not.toBeInTheDocument()
    })

    it('reads an UNINVOICED job as the action it is, and links where to take it', () => {
      render(
        <RunwayStrip
          orgSlug="acme"
          runway={[job({ inflowBefore: 0, dueAfter: 0, billing: 'uninvoiced' })]}
        />
      )
      expect(screen.getByText(/not invoiced yet/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /bill this job/i })).toHaveAttribute(
        'href',
        '/acme/leads/L1/invoices'
      )
      expect(screen.queryByText(/paid in full/i)).not.toBeInTheDocument()
    })

    it('renders collected and never-invoiced DIFFERENTLY, not as one string', () => {
      const { container: collected } = render(
        <RunwayStrip orgSlug="acme" runway={[job({ inflowBefore: 0, dueAfter: 0, billing: 'collected' })]} />
      )
      const { container: uninvoiced } = render(
        <RunwayStrip orgSlug="acme" runway={[job({ inflowBefore: 0, dueAfter: 0, billing: 'uninvoiced' })]} />
      )
      expect(collected.textContent).not.toBe(uninvoiced.textContent)
    })

    it('prompts to SEND an invoice that was drafted but never went out', () => {
      render(<RunwayStrip orgSlug="acme" runway={[job({ inflowBefore: 0, dueAfter: 0, billing: 'draft' })]} />)
      expect(screen.getByText(/drafted, never sent/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /send the invoice/i })).toHaveAttribute(
        'href',
        '/acme/leads/L1/invoices'
      )
    })

    it('still says nothing lands before the job when the money is all due after', () => {
      render(<RunwayStrip orgSlug="acme" runway={[job({ inflowBefore: 0, dueAfter: 5000 })]} />)
      expect(screen.getByText(/nothing owed lands before this job/i)).toBeInTheDocument()
      expect(screen.getByText(/\$5,000 owed, due after/i)).toBeInTheDocument()
    })
  })

  // ── The runway proper ──────────────────────────────────────────────────────

  describe('running balance', () => {
    it('shows the running position on every row', () => {
      render(<RunwayStrip orgSlug="acme" runway={[job({ cumulative: 7850 })]} />)
      expect(screen.getByText(/running/i)).toBeInTheDocument()
      expect(screen.getByText('$7,850')).toBeInTheDocument()
    })

    it('names the first shortfall in WORDS and a sign, never colour alone', () => {
      const { container } = render(
        <RunwayStrip orgSlug="acme" runway={[job({ cumulative: -450, firstShortfall: true })]} />
      )
      expect(screen.getByText(/cash runs short here/i)).toBeInTheDocument()
      // the figure itself carries the sign, so the state survives greyscale
      expect(screen.getByText('-$450')).toBeInTheDocument()
      expect(container.querySelector('svg')).not.toBeNull() // warning glyph
    })

    it('distinguishes the first shortfall from the rows that stay short after it', () => {
      render(
        <RunwayStrip
          orgSlug="acme"
          runway={[
            job({ eventId: 'a', title: 'First short', cumulative: -450, firstShortfall: true }),
            job({ eventId: 'b', title: 'Harbour market', cumulative: -600, firstShortfall: false }),
          ]}
        />
      )
      expect(screen.getByText(/cash runs short here/i)).toBeInTheDocument()
      // the later row stays flagged, but only one row claims to be the turn
      expect(screen.getByText(/still short/i)).toBeInTheDocument()
      expect(screen.getAllByText(/cash runs short here/i)).toHaveLength(1)
    })
  })
})
