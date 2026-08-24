import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { InvoiceViewClient } from '@/components/invoices/InvoiceViewClient'
import type { PublicInvoice } from '@/actions/invoices-public'

const inv = (o: Partial<PublicInvoice>): PublicInvoice => ({
  type: 'quick',
  line_items: [{ description: 'Catering', quantity: 1, unit_price: 100 }],
  subtotal: 100,
  discount_amount: 0,
  tax_amount: 0,
  credits: [],
  total: 100,
  amount_paid: 0,
  balance: 100,
  tips_enabled: false,
  created_at: '2026-08-01T00:00:00.000Z',
  ...o,
})

describe('InvoiceViewClient', () => {
  it('renders the heading with the invoice number', () => {
    render(<InvoiceViewClient invoice={inv({ number: 'INV-001' })} />)
    expect(screen.getByRole('heading', { name: /invoice #inv-001/i })).toBeInTheDocument()
  })

  it('renders the from and bill-to names', () => {
    render(
      <InvoiceViewClient
        invoice={inv({
          from: { name: 'BrewTrax', address: '1 Keg Ln' },
          bill_to: { name: 'Dana Kim', company: 'Riverside' },
        })}
      />,
    )
    expect(screen.getByText('BrewTrax')).toBeInTheDocument()
    expect(screen.getByText('Dana Kim')).toBeInTheDocument()
  })

  it('shows the discount reason on the totals line', () => {
    render(
      <InvoiceViewClient
        invoice={inv({
          discount: { type: 'percent', value: 10, reason: 'Returning customer' },
          discount_amount: 10,
        })}
      />,
    )
    expect(screen.getByText(/discount — returning customer/i)).toBeInTheDocument()
  })

  it('shows the Paid chip when balance is zero', () => {
    render(<InvoiceViewClient invoice={inv({ amount_paid: 100, balance: 0 })} />)
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('does not show the Paid chip when a balance remains', () => {
    render(<InvoiceViewClient invoice={inv({ balance: 100 })} />)
    expect(screen.queryByText('Paid')).not.toBeInTheDocument()
  })

  // --- shared-kit / token invariants ---

  // The hand-rolled chip used bg-emerald-100/text-emerald-800. globals.css re-grades
  // the stock palette, so it *looked* on-brand in light mode while having no .dark
  // override at all. Pin it to the kit pill so it cannot regress to raw palette classes.
  it('renders the Paid chip as the kit StatusPill on status tokens, not raw palette classes', () => {
    render(<InvoiceViewClient invoice={inv({ amount_paid: 100, balance: 0 })} />)
    const pill = screen.getByText('Paid')
    expect(pill.dataset.slot).toBe('status-pill')
    expect(pill.className).toContain('var(--status-confirmed-bg)')
    expect(pill.className).not.toContain('emerald-100')
  })

  // bg-white left the sheet light while the text tokens flipped — unreadable in dark
  // mode. bg-card is what the admin editor's identical sheet uses.
  it('paints the invoice sheet on the card token so dark mode is readable', () => {
    const { container } = render(<InvoiceViewClient invoice={inv({})} />)
    const sheet = container.querySelector('.invoice-document')
    expect(sheet?.className).toMatch(/\bbg-card\b/)
    // Prefix-aware: a plain substring/word-boundary match would also match the
    // print-scoped `print:bg-white` (a "print:" prefix still leaves a `\b`
    // boundary right before "bg-white"), so split into class tokens and check
    // the unprefixed literal is absent rather than matching a substring.
    const classes = sheet?.className.split(/\s+/) ?? []
    expect(classes).not.toContain('bg-white')
  })

  // The sheet's screen background (bg-card) and default text colour both flip
  // under dark mode, but printed/PDF output should always be white paper with
  // dark ink — mirroring the print:bg-white already on the page chrome around
  // the sheet. Without this, a dark-mode print either paints the sheet near-black
  // (if the browser prints backgrounds) or leaves near-white text on white paper.
  it('forces the sheet to white paper with dark text when printed, regardless of theme', () => {
    const { container } = render(<InvoiceViewClient invoice={inv({})} />)
    const sheet = container.querySelector('.invoice-document')
    const classes = sheet?.className.split(/\s+/) ?? []
    expect(classes).toContain('print:bg-white')
    expect(classes).toContain('print:text-black')
  })

  // At 375px the from-column and the number-column were jammed side by side, wrapping
  // both. jsdom cannot measure, so pin the mechanism: the header stacks below md and
  // its columns can shrink.
  it('stacks the header columns below md and lets them shrink', () => {
    const { container } = render(
      <InvoiceViewClient invoice={inv({ from: { name: 'BrewTrax', address: '1 Keg Ln' } })} />,
    )
    const header = container.querySelector('header')
    expect(header?.className).toMatch(/max-md:flex-col/)
    // Right-ragged wrapped text reads badly on a narrow screen.
    expect(header?.lastElementChild?.className).toMatch(/max-md:text-left/)
    for (const col of Array.from(header?.children ?? [])) {
      expect(col.className).toMatch(/min-w-0/)
    }
  })

  it('renders every totals figure with tabular numerals so the column aligns', () => {
    const { container } = render(
      <InvoiceViewClient
        invoice={inv({ discount_amount: 10, tax_amount: 5, amount_paid: 40, balance: 55 })}
      />,
    )
    const figures = Array.from(container.querySelectorAll('dl dd'))
    expect(figures.length).toBeGreaterThan(1)
    for (const dd of figures) expect(dd.className).toMatch(/tabular-nums/)
  })

  // --- composition invariants (screen-composition checklist) ---

  it('renders the balance figure exactly once, with the right value', () => {
    render(<InvoiceViewClient invoice={inv({ amount_paid: 40, balance: 60 })} />)
    expect(screen.getAllByTestId('public-balance')).toHaveLength(1)
    expect(screen.getAllByText(/^Balance due$/i)).toHaveLength(1)
    // The old layout repeated it as "Balance due: $60.00" beneath the totals block.
    expect(screen.queryByText(/Balance due:/i)).not.toBeInTheDocument()
    // Counting the node proves it is not duplicated; this proves it is correct.
    expect(screen.getByTestId('public-balance')).toHaveTextContent('$60.00')
  })

  it('gives the balance visual dominance over the supporting totals lines', () => {
    const { container } = render(<InvoiceViewClient invoice={inv({ balance: 60 })} />)
    expect(screen.getByTestId('public-balance').className).toMatch(/text-2xl/)
    expect(container.querySelectorAll('.text-2xl')).toHaveLength(1)
  })

  it('reads "Paid in full" when nothing is owed', () => {
    render(<InvoiceViewClient invoice={inv({ amount_paid: 100, balance: 0 })} />)
    expect(screen.getByTestId('public-balance-note')).toHaveTextContent(/paid in full/i)
  })

  it('reads as overdue when the due date has passed and a balance remains', () => {
    render(<InvoiceViewClient invoice={inv({ balance: 100, due_date: '2020-01-01' })} />)
    expect(screen.getByTestId('public-balance-note')).toHaveTextContent(/overdue/i)
  })

  it('reads the note relatively when the due date is still ahead, without repeating the date', () => {
    render(<InvoiceViewClient invoice={inv({ balance: 100, due_date: '2099-01-01' })} />)
    expect(screen.getByTestId('public-balance-note')).toHaveTextContent(/due in \d+ days?/i)
    // The header already carries the date; the note interprets rather than repeats it.
    expect(screen.getAllByText(/2099-01-01/)).toHaveLength(1)
  })

  it('drops the line-items table entirely when there are none, rather than stranding headers', () => {
    render(<InvoiceViewClient invoice={inv({ line_items: [], subtotal: 0, total: 0, balance: 0 })} />)
    expect(screen.queryByTestId('invoice-line-items')).not.toBeInTheDocument()
    expect(screen.queryByText('Unit price')).not.toBeInTheDocument()
  })

  // jsdom cannot measure overflow, so pin the mechanism structurally: money renders as
  // unbreakable tokens, so the 4-column table must scroll inside its own container
  // rather than pushing the page sideways at 375px.
  it('confines the line-items table to its own scroll container and tightens the sheet on mobile', () => {
    const { container } = render(<InvoiceViewClient invoice={inv({})} />)
    expect(screen.getByTestId('invoice-line-items').parentElement?.className).toMatch(/overflow-x-auto/)
    expect(container.querySelector('.invoice-document')?.className).toMatch(/max-md:px-5/)
  })
})

// --- zone-stable date rendering (the /checkin SSR crash class, PR #134) ---

// Run an assertion under an explicit process zone. Modern Node re-reads
// process.env.TZ, so this exercises the ambient-zone hazard directly instead
// of depending on whatever zone the host machine happens to be in.
function withTZ(tz: string, fn: () => void) {
  const prev = process.env.TZ
  process.env.TZ = tz
  try {
    fn()
  } finally {
    if (prev === undefined) delete process.env.TZ
    else process.env.TZ = prev
  }
}

// 02:30 UTC — any zone west of UTC is still on the PREVIOUS calendar day at
// this instant (Denver reads Aug 12). If a formatter leaks the ambient zone,
// this instant exposes it.
const SENT_NEAR_MIDNIGHT_UTC = '2026-08-13T02:30:00.000Z'

describe('InvoiceViewClient — the customer document is zone-stable by construction', () => {
  // This sheet is a SERVER component: it renders once, wherever the deploy
  // region happens to be, with no hydration pass to correct it. The old
  // ambient `toLocaleDateString()` meant the customer-visible Sent date
  // depended on the server's clock and locale. The fix pins the date to UTC
  // and says so — one true rendering, labeled.
  it('pins the Sent stamp to UTC and labels it, whatever zone renders it', () => {
    withTZ('America/Denver', () => {
      render(<InvoiceViewClient invoice={inv({ sent_at: SENT_NEAR_MIDNIGHT_UTC })} />)
      // Ambient Denver formatting of this instant would read Aug 12.
      expect(screen.getByText('Sent Aug 13, 2026 (UTC)')).toBeInTheDocument()
    })
  })

  it('SSRs the identical pinned face in every server zone — no ambient date in the payload', () => {
    const payloads = ['America/Denver', 'Pacific/Auckland'].map((tz) => {
      let html = ''
      withTZ(tz, () => {
        html = renderToString(<InvoiceViewClient invoice={inv({ sent_at: SENT_NEAR_MIDNIGHT_UTC })} />)
      })
      return html.replace(/<!-- -->/g, '')
    })
    for (const text of payloads) {
      expect(text).toContain('Sent Aug 13, 2026 (UTC)')
      // Neither the Denver ambient face nor the old default '8/12/2026' style.
      expect(text).not.toContain('Aug 12, 2026')
      expect(text).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/)
    }
    expect(payloads[0]).toBe(payloads[1])
  })

  // The balance note's overdue/due-in judgment is day math relative to "now".
  // It must run on the UTC calendar (lib/invoice-status.daysOverdue) — the
  // pill's aging convention — not the render machine's zone, or the same
  // invoice reads differently per deploy region.
  it('judges overdue on UTC day math, not the render machine\'s zone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T02:30:00.000Z'))
    try {
      withTZ('America/Denver', () => {
        // 02:30 UTC on Aug 13 is 20:30 Aug 12 in Denver: ambient-zone math
        // said "Due today" while UTC day math says one day overdue.
        render(<InvoiceViewClient invoice={inv({ balance: 100, due_date: '2026-08-12' })} />)
        expect(screen.getByTestId('public-balance-note')).toHaveTextContent('1 day overdue')
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
