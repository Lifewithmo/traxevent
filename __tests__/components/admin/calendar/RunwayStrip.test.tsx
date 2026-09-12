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
  pastDue: 0,
  inflowBefore: 8000,
  dueAfter: 2000,
  contributions: [],
  billing: 'outstanding',
  untimedOwed: 0,
  leadId: 'L1',
  boothFee: 0,
  windowFrom: '2026-08-16',
  carriedIn: 0,
  cashIn: 8000,
  cashInThisJob: 8000,
  cashInOther: 0,
  agedAr: 0,
  cumulative: 8000,
  firstShortfall: false,
  ...o,
})

const jobs: RunwayJob[] = [
  job(),
  job({ eventId: 'e2', title: 'Mission gala', date: '2026-09-05', inflowBefore: 0, dueAfter: 5000, leadId: 'L2', windowFrom: '2026-08-23', carriedIn: 8000, cashIn: 0, cashInThisJob: 0, cashInOther: 0, cumulative: 8000 }),
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
    // Three, not five. The verdict line above now covers the whole horizon, so
    // the rows only carry what the operator can still act on — and the rail is
    // ~130px shorter on a 280px phone drawer for it.
    const list = screen.getByRole('list', { name: /runway/i })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    // …and the tail is a LINK to the full book, not a dead-end <p>.
    const more = screen.getByRole('link', { name: /\+5 more/i })
    expect(more).toHaveAttribute('href', '/acme/calendar?view=agenda')
  })

  // ── Composition: no card stack, and a verdict at the top ───────────────────

  it('divides the rows with hairlines instead of stacking five bordered cards', () => {
    render(<RunwayStrip orgSlug="acme" runway={jobs} />)
    const list = screen.getByRole('list', { name: /runway/i })
    // the LIST carries the rules…
    expect(list.className).toMatch(/divide-y/)
    // …and no row is a card of its own.
    for (const li of within(list).getAllByRole('listitem')) {
      expect(li.className).not.toMatch(/\bborder\b/)
      expect(li.className).not.toMatch(/bg-card/)
      expect(li.className).not.toMatch(/rounded-md/)
    }
  })

  it('states the verdict up front instead of making you expand rows to find it', () => {
    render(<RunwayStrip orgSlug="acme" runway={jobs} />)
    expect(screen.getByText('Stays positive through Sep 5')).toBeInTheDocument()
  })

  it('names WHERE the cash breaks, reading the whole runway and not just the visible rows', () => {
    // The shortfall is job six of eight — past the three-row cap, so before the
    // verdict line existed it was undiscoverable from this surface.
    const many: RunwayJob[] = Array.from({ length: 8 }, (_, i) =>
      job({
        eventId: `e${i}`,
        title: `Job ${i}`,
        date: `2026-09-0${i + 1}`,
        cumulative: i >= 5 ? -400 : 500,
        firstShortfall: i === 5,
      })
    )
    render(<RunwayStrip orgSlug="acme" runway={many} />)
    expect(screen.getByText('Runs short at Job 5 · Sep 6')).toBeInTheDocument()
    // and the row itself is NOT rendered, so this is genuinely new information
    expect(screen.queryByRole('button', { name: /job 5/i })).not.toBeInTheDocument()
  })

  // ── The headline may not reassure from an empty book ───────────────────────

  describe('the verdict has a third state', () => {
    const nothing = (o: Partial<RunwayJob> = {}) =>
      job({ inflowBefore: 0, dueAfter: 0, cashIn: 0, cashInThisJob: 0, cashInOther: 0, cumulative: 0, ...o })

    it('does not claim a positive position from an org with no receivables at all', () => {
      const many = [
        nothing({ eventId: 'a', title: 'A', date: '2026-09-01', billing: 'uninvoiced' }),
        nothing({ eventId: 'b', title: 'B', date: '2026-09-10', billing: 'uninvoiced' }),
      ]
      render(<RunwayStrip orgSlug="acme" runway={many} />)
      // "Stays positive through Sep 10" directly above "2 jobs still to bill"
      // is a reassurance computed from nothing at all.
      expect(screen.queryByText(/stays positive/i)).not.toBeInTheDocument()
      expect(screen.getByText(/no receivables on file/i)).toBeInTheDocument()
      expect(screen.getByText('2 jobs still to bill')).toBeInTheDocument()
    })

    it('says nothing is scheduled to land when the only money on file is already late', () => {
      render(
        <RunwayStrip orgSlug="acme" runway={[nothing({ agedAr: 12000, billing: 'uninvoiced' })]} />
      )
      expect(screen.queryByText(/stays positive/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/no receivables on file/i)).not.toBeInTheDocument()
      expect(screen.getByText(/nothing.*scheduled to land/i)).toBeInTheDocument()
    })

    it('still says "stays positive" when there is real money scheduled to land', () => {
      render(<RunwayStrip orgSlug="acme" runway={jobs} />)
      expect(screen.getByText('Stays positive through Sep 5')).toBeInTheDocument()
    })
  })

  // ── Aged AR is surfaced, not silently subtracted ───────────────────────────

  describe('delinquent receivables', () => {
    it('reports the past-due pile the running balance excludes, and where to chase it', () => {
      render(
        <RunwayStrip
          orgSlug="acme"
          runway={[job({ agedAr: 12000, cashIn: 0, cashInThisJob: 0, cashInOther: 0, boothFee: 500, cumulative: -500, firstShortfall: true, billing: 'uninvoiced', inflowBefore: 0, dueAfter: 0 })]}
        />
      )
      const chase = screen.getByRole('link', { name: /past due/i })
      expect(chase).toHaveAttribute('href', '/acme/invoices')
      expect(chase.textContent).toMatch(/\$12,000/)
      // named as excluded, in words — never signalled by colour alone
      expect(chase.textContent).toMatch(/not counted/i)
    })

    it('says nothing about past-due money when there is none', () => {
      render(<RunwayStrip orgSlug="acme" runway={jobs} />)
      expect(screen.queryByRole('link', { name: /past due/i })).not.toBeInTheDocument()
    })

    it('discloses the exclusion inside the ledger, so the running figure is inspectable', () => {
      render(
        <RunwayStrip
          orgSlug="acme"
          runway={[job({ agedAr: 12000, cashIn: 0, cashInThisJob: 0, cashInOther: 0, boothFee: 500, cumulative: -500, inflowBefore: 0, dueAfter: 0 })]}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /alder wedding/i }))
      // the ledger names the exclusion where the balance is read, with the figure
      expect(screen.getByText(/excludes \$12,000 already past due/i)).toBeInTheDocument()
    })
  })

  it('counts the unbilled jobs across the whole horizon as the action they are', () => {
    const many: RunwayJob[] = [
      job({ eventId: 'a', title: 'A', billing: 'outstanding' }),
      job({ eventId: 'b', title: 'B', billing: 'uninvoiced', inflowBefore: 0, dueAfter: 0 }),
      job({ eventId: 'c', title: 'C', billing: 'draft', inflowBefore: 0, dueAfter: 0 }),
      job({ eventId: 'd', title: 'D', billing: 'collected', inflowBefore: 0, dueAfter: 0 }),
    ]
    render(<RunwayStrip orgSlug="acme" runway={many} />)
    expect(screen.getByText('2 jobs still to bill')).toBeInTheDocument()
  })

  it('says nothing about billing when every job is billed', () => {
    render(<RunwayStrip orgSlug="acme" runway={jobs} />)
    expect(screen.queryByText(/still to bill/i)).not.toBeInTheDocument()
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
      expect(screen.queryByText('Balance 1041')).not.toBeInTheDocument()

      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      // the panel the control names actually exists once open
      expect(document.getElementById(toggle.getAttribute('aria-controls')!)).not.toBeNull()
    })

    it('never points aria-controls at an element that is not in the document', () => {
      // The panel mounts only while open, so advertising its id while collapsed
      // is a dangling IDREF — a promise to assistive tech that nothing keeps.
      render(<RunwayStrip orgSlug="acme" runway={withContributions} />)
      const toggle = screen.getByRole('button', { name: /alder wedding/i })
      expect(toggle).not.toHaveAttribute('aria-controls')

      fireEvent.click(toggle)
      const panelId = toggle.getAttribute('aria-controls')
      expect(panelId).toBeTruthy()
      expect(document.getElementById(panelId!)).not.toBeNull()

      fireEvent.click(toggle)
      expect(toggle).not.toHaveAttribute('aria-controls')
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

    it('names this client’s past-due balance as debt, not as money "expected to land"', () => {
      render(<RunwayStrip orgSlug="acme" runway={[job({ inflowBefore: 3000, pastDue: 5000 })]} />)
      expect(screen.getByText(/past due/i)).toBeInTheDocument()
      expect(screen.getByText('$5,000')).toBeInTheDocument()
      // the forecast figure is the honest one — the late money is not inside it
      expect(screen.getByText('$3,000')).toBeInTheDocument()
      expect(screen.getByText(/expected to land before this job/i)).toBeInTheDocument()
    })

    it('explains the gap between what THIS client owes and the cash figure beside it', () => {
      // Lead A owes $1,000; unrelated lead B owes $4,000 landing in the same
      // window. "Deposit $1,000" sitting directly above "+$5,000" with nothing
      // between them is a $4,000 hole in a surface whose contract is that every
      // scalar reconciles from parts that ship on the row.
      render(
        <RunwayStrip
          orgSlug="acme"
          runway={[
            job({
              inflowBefore: 1000,
              dueAfter: 0,
              contributions: [contribution({ amount: 1000 })],
              cashIn: 5000,
              cashInThisJob: 1000,
              cashInOther: 4000,
              cumulative: 5000,
            }),
          ]}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /alder wedding/i }))
      expect(screen.getByText('+$5,000')).toBeInTheDocument()
      // the two parts are named and both are on the row, so the $4,000 the
      // contributions do not explain has somewhere to come from
      const mine = screen.getByText(/^from this job.s client$/i)
      expect(mine.parentElement).toHaveTextContent('$1,000')
      const theirs = screen.getByText(/^from other clients$/i)
      expect(theirs.parentElement).toHaveTextContent('$4,000')
    })

    it('names the window a cash figure covers, so "lands" is not read as "all of it"', () => {
      render(
        <RunwayStrip
          orgSlug="acme"
          runway={[job({ windowFrom: '2026-08-16', date: '2026-08-22', contributions: [contribution()] })]}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /alder wedding/i }))
      expect(screen.getByText(/Aug 16\s*–\s*Aug 22/)).toBeInTheDocument()
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
