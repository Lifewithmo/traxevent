import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DaySpine } from '@/components/admin/calendar/DaySpine'
import type { DayDetail } from '@/actions/calendar'
import type { RunwayJob } from '@/lib/calendar-cashflow'
import type { CalendarItem } from '@/lib/calendar'
import type { Event, Lead, NormalizedInvoice, Proposal } from '@/lib/types'

const event = {
  id: 'e1',
  name: 'Ceremony at Alder',
  slug: 'ceremony-alder',
  status: 'active',
  event_start: '2026-08-22',
  event_end: '2026-08-22',
  hours: { start: '16:00', end: '21:00' },
  lead_id: 'l1',
} as Event

const job = {
  id: 'l1',
  title: 'Alder & Vine wedding',
  name: 'Alder & Vine',
  stage: 'closed_won',
  estimated_value: 12000,
  event_date: '2026-08-22',
} as Lead

const proposal = {
  id: 'p1',
  lead_id: 'l1',
  title: 'Full-day package',
  status: 'accepted',
  selection: { selected_total: 3500 },
  line_items: [],
} as unknown as Proposal

const invoice = {
  id: 'i1',
  lead_id: 'l1',
  number: '1001',
  title: 'Deposit',
  lifecycle: 'sent',
  due_date: '2026-08-15',
  payments: [],
  line_items: [{ description: 'Deposit', quantity: 1, unit_price: 1500 }],
} as unknown as NormalizedInvoice

const task: CalendarItem = {
  id: 't1',
  title: 'Confirm power access',
  date: '2026-08-22',
  kind: 'task',
  href: '/acme/leads/l1',
  detail: 'Before load-in',
}

const blocker: CalendarItem = {
  id: 'c1',
  title: 'Insurance expires',
  date: '2026-08-22',
  kind: 'compliance',
  href: '/acme/compliance',
  blocker: true,
  detail: 'blocks Ceremony at Alder',
}

const detail: DayDetail = {
  ymd: '2026-08-22',
  events: [event],
  tasks: [task],
  blockers: [blocker],
  drops: [],
  invoicesDue: [],
  related: { e1: { job, proposals: [proposal], invoices: [invoice] } },
}

const runway: RunwayJob[] = [
  {
    eventId: 'e1', title: 'Ceremony at Alder', date: '2026-08-22', pastDue: 0, inflowBefore: 900,
    dueAfter: 0, contributions: [], billing: 'outstanding', untimedOwed: 0, leadId: 'L1',
    boothFee: 0, windowFrom: '2026-08-18', carriedIn: 0, cashIn: 900, cashInThisJob: 900,
    cashInOther: 0, agedAr: 0, cumulative: 900, firstShortfall: false,
  },
]

describe('DaySpine', () => {
  it('renders the day event with its working hours', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText('Ceremony at Alder')).toBeInTheDocument()
    expect(screen.getByText('16:00 – 21:00')).toBeInTheDocument()
  })

  it('renders the linked job, proposal and invoice as related rows with amounts', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText('Alder & Vine wedding')).toBeInTheDocument()
    expect(screen.getByText('Full-day package')).toBeInTheDocument()
    expect(screen.getByText('$3,500')).toBeInTheDocument()
    expect(screen.getByText('Invoice 1001')).toBeInTheDocument()
    expect(screen.getByText('$1,500')).toBeInTheDocument()
  })

  it('folds blockers into the spine inline (no separate attention rail)', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText('Insurance expires')).toBeInTheDocument()
  })

  it('shows the prep tasks for the day', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText('Confirm power access')).toBeInTheDocument()
  })

  it('shows the day’s runway line for the booked job (receivables timing)', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={detail} runway={runway} />)
    expect(screen.getByText(/expected to land before this job/i)).toBeInTheDocument()
  })

  it('shows a hour-less event as "time TBD"', () => {
    const noHours: DayDetail = {
      ...detail,
      events: [{ ...event, hours: undefined } as Event],
      tasks: [],
      blockers: [],
    }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={noHours} runway={[]} />)
    expect(screen.getByText(/time tbd/i)).toBeInTheDocument()
  })

  it('renders one specific CTA when the day holds nothing', () => {
    const empty: DayDetail = { ymd: '2026-08-22', events: [], tasks: [], blockers: [], drops: [], invoicesDue: [], related: {} }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={empty} runway={[]} />)
    expect(screen.getByRole('link', { name: /book a job/i })).toHaveAttribute('href', '/acme/new-event?date=2026-08-22')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The shipped contradiction: DayDetail carries `invoicesDue` (the same
// invoice_due items the week/month cell renders as a money chip) and the spine
// dropped them on the floor — so a day holding a $4,200 balance and no booked
// event read "Nothing scheduled" while its own grid cell showed the money.
// ─────────────────────────────────────────────────────────────────────────────
const invoiceDue: CalendarItem = {
  id: 'inv-due',
  title: 'Bar service — final',
  date: '2026-08-22',
  kind: 'invoice_due',
  href: '/acme/leads/l1',
  amount: 4200,
  detail: 'Rooftop Wedding',
  leadId: 'l1',
}

describe('DaySpine — invoices falling due that day', () => {
  const moneyOnly: DayDetail = {
    ymd: '2026-08-22',
    events: [],
    tasks: [],
    blockers: [],
    drops: [],
    invoicesDue: [invoiceDue],
    related: {},
  }

  it('renders the day’s invoice_due item with its outstanding balance', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={moneyOnly} runway={[]} />)
    expect(screen.getByText('Bar service — final')).toBeInTheDocument()
    expect(screen.getByText('$4,200')).toBeInTheDocument()
  })

  it('does NOT call a day carrying only an invoice "Nothing scheduled"', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={moneyOnly} runway={[]} />)
    expect(screen.queryByText(/nothing scheduled/i)).not.toBeInTheDocument()
  })

  it('still shows the empty state when the day truly holds nothing', () => {
    const empty: DayDetail = { ymd: '2026-08-22', events: [], tasks: [], blockers: [], drops: [], invoicesDue: [], related: {} }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={empty} runway={[]} />)
    expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument()
  })

  it('totals the balances only when more than one invoice falls due (never restates a single one)', () => {
    const one = render(<DaySpine orgSlug="acme" today="2026-08-18" detail={moneyOnly} runway={[]} />)
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument()
    one.unmount()

    const two: DayDetail = {
      ...moneyOnly,
      invoicesDue: [invoiceDue, { ...invoiceDue, id: 'inv-due-2', title: 'Deposit', amount: 800 }],
    }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={two} runway={[]} />)
    expect(screen.getByText('$5,000 total')).toBeInTheDocument()
  })

  it('on a day that also holds a booked job, money-due sorts BELOW the job (where + who outrank money)', () => {
    const both: DayDetail = { ...detail, invoicesDue: [invoiceDue] }
    const { container } = render(<DaySpine orgSlug="acme" today="2026-08-18" detail={both} runway={runway} />)
    const text = container.textContent ?? ''
    expect(text.indexOf('Ceremony at Alder')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('Bar service — final')).toBeGreaterThan(text.indexOf('Ceremony at Alder'))
  })

  it('leads with the money when the day holds NO job at all', () => {
    const noJob: DayDetail = { ...moneyOnly, tasks: [task] }
    const { container } = render(<DaySpine orgSlug="acme" today="2026-08-18" detail={noJob} runway={[]} />)
    const text = container.textContent ?? ''
    // Guard the ordering assertion: indexOf(-1) would satisfy `toBeLessThan`
    // for free if the money section were never rendered at all.
    expect(text).toContain('Bar service — final')
    expect(text).toContain('Confirm power access')
    expect(text.indexOf('Bar service — final')).toBeLessThan(text.indexOf('Confirm power access'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The crew day sheet: where am I going, and who do I call.
// ─────────────────────────────────────────────────────────────────────────────
const sited = {
  ...event,
  headcount: 120,
  location: { name: 'Alder Barn', address: '4102 W State St, Boise, ID 83703' },
  key_contacts: [{ name: 'Dana Reyes', role: 'Coordinator', phone: '208-555-0192' }],
} as Event

const sitedDetail: DayDetail = {
  ...detail,
  events: [sited],
  tasks: [],
  blockers: [],
}

describe('DaySpine — where am I going', () => {
  it('renders a maps link whose query is the venue AND street, percent-encoded', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={sitedDetail} runway={runway} />)
    const link = screen.getByRole('link', { name: /alder barn, 4102 w state st, boise, id 83703/i })
    expect(link).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=Alder%20Barn%2C%204102%20W%20State%20St%2C%20Boise%2C%20ID%2083703'
    )
  })

  it('names the destination in the link, so the accessible name is not a bare "Navigate"', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={sitedDetail} runway={runway} />)
    expect(
      screen.getByRole('link', { name: 'Navigate to Alder Barn, 4102 W State St, Boise, ID 83703' })
    ).toBeInTheDocument()
  })

  it('still maps a venue with no street address (a venue name geocodes)', () => {
    const venueOnly: DayDetail = {
      ...sitedDetail,
      events: [{ ...sited, location: { name: 'Alder Barn' } } as Event],
    }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={venueOnly} runway={runway} />)
    expect(screen.getByRole('link', { name: 'Navigate to Alder Barn' })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=Alder%20Barn'
    )
  })

  it('renders NO maps link at all when the job has no location (a blank field is worse than none)', () => {
    const placeless: DayDetail = { ...sitedDetail, events: [{ ...sited, location: undefined } as Event] }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={placeless} runway={runway} />)
    // Positive control: the job block rendered; only the destination is withheld.
    expect(screen.getByText('Ceremony at Alder')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^navigate to/i })).not.toBeInTheDocument()
  })

  it('gives a drop pickup its own maps link from the feed item’s location', () => {
    const drop: CalendarItem = {
      id: 'd1:w1',
      title: 'Drop pickup: Weekend Box',
      date: '2026-08-22',
      kind: 'drop',
      href: '/acme/drop-orders/d1',
      detail: 'SW Boise',
      location: 'SW Boise, 900 S Latah St',
    }
    render(
      <DaySpine orgSlug="acme" today="2026-08-18" detail={{ ...sitedDetail, drops: [drop] }} runway={runway} />
    )
    expect(screen.getByRole('link', { name: 'Navigate to SW Boise, 900 S Latah St' })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=SW%20Boise%2C%20900%20S%20Latah%20St'
    )
  })
})

describe('DaySpine — who do I call', () => {
  it('renders the event key contact as a tel: link named for the person', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={sitedDetail} runway={runway} />)
    const call = screen.getByRole('link', { name: 'Call Dana Reyes, Coordinator' })
    expect(call).toHaveAttribute('href', 'tel:2085550192')
  })

  it('falls back to the linked opportunity’s own phone when the job names no key contact', () => {
    const viaLead: DayDetail = {
      ...sitedDetail,
      events: [{ ...sited, key_contacts: undefined } as Event],
      related: { e1: { job: { ...job, phone: '(208) 555-0144' } as Lead, proposals: [], invoices: [] } },
    }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={viaLead} runway={runway} />)
    expect(screen.getByRole('link', { name: 'Call Alder & Vine, Client' })).toHaveAttribute(
      'href',
      'tel:2085550144'
    )
  })

  it('renders NO tel: link when nobody on the job has a number', () => {
    const noPhone: DayDetail = {
      ...sitedDetail,
      events: [{ ...sited, key_contacts: [{ name: 'Dana Reyes', role: 'Coordinator' }] } as Event],
      related: { e1: { job: { ...job, phone: undefined } as Lead, proposals: [], invoices: [] } },
    }
    const { container } = render(<DaySpine orgSlug="acme" today="2026-08-18" detail={noPhone} runway={runway} />)
    expect(container.querySelector('a[href^="tel:"]')).toBeNull()
    // …but the person who is meeting the crew on site is still named.
    expect(screen.getByText('Dana Reyes')).toBeInTheDocument()
  })

  it('refuses to dial a number that is not one (no dead tel: links in a van)', () => {
    const junk: DayDetail = {
      ...sitedDetail,
      events: [{ ...sited, key_contacts: [{ name: 'Dana Reyes', role: 'Coordinator', phone: 'ask Ben' }] } as Event],
      related: { e1: { job: { ...job, phone: undefined } as Lead, proposals: [], invoices: [] } },
    }
    const { container } = render(<DaySpine orgSlug="acme" today="2026-08-18" detail={junk} runway={runway} />)
    // Positive control: the contact block DID render — it is the dial that is withheld.
    expect(screen.getByText('Dana Reyes')).toBeInTheDocument()
    expect(container.querySelector('a[href^="tel:"]')).toBeNull()
  })

  it('keeps every on-site tap target at least 44px tall (one-handed, outdoors)', () => {
    const { container } = render(<DaySpine orgSlug="acme" today="2026-08-18" detail={sitedDetail} runway={runway} />)
    const targets = container.querySelectorAll('a[href^="tel:"], a[href^="https://maps.google.com"]')
    expect(targets.length).toBeGreaterThan(0)
    for (const t of targets) expect(t.className).toMatch(/min-h-11/)
  })
})

describe('DaySpine — headcount', () => {
  it('shows the expected guest count next to the working hours', () => {
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={sitedDetail} runway={runway} />)
    expect(screen.getByText('120 guests')).toBeInTheDocument()
  })

  it('says "1 guest", not "1 guests"', () => {
    const one: DayDetail = { ...sitedDetail, events: [{ ...sited, headcount: 1 } as Event] }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={one} runway={runway} />)
    expect(screen.getByText('1 guest')).toBeInTheDocument()
  })

  it('renders nothing at all when the job carries no headcount', () => {
    const none: DayDetail = { ...sitedDetail, events: [{ ...sited, headcount: undefined } as Event] }
    render(<DaySpine orgSlug="acme" today="2026-08-18" detail={none} runway={runway} />)
    // Positive control: the line the count would have joined is still there.
    expect(screen.getByText('16:00 – 21:00')).toBeInTheDocument()
    expect(screen.queryByText(/guests?$/)).not.toBeInTheDocument()
  })
})

describe('DaySpine — composition', () => {
  it('puts where + who ABOVE the paperwork inside a job block', () => {
    const { container } = render(<DaySpine orgSlug="acme" today="2026-08-18" detail={sitedDetail} runway={runway} />)
    const text = container.textContent ?? ''
    expect(text.indexOf('Alder Barn')).toBeLessThan(text.indexOf('Dana Reyes'))
    expect(text.indexOf('Dana Reyes')).toBeLessThan(text.indexOf('Alder & Vine wedding'))
  })

  it('collapses the job/proposal/invoice card stack into ONE paperwork ledger', () => {
    const { container } = render(<DaySpine orgSlug="acme" today="2026-08-18" detail={sitedDetail} runway={runway} />)
    expect(container.querySelectorAll('[data-slot="related-record-card"]')).toHaveLength(1)
    expect(screen.getByText('Paperwork')).toBeInTheDocument()
  })

  it('surfaces a stop-work blocker above the jobs it blocks', () => {
    const blocked: DayDetail = { ...sitedDetail, blockers: [blocker] }
    const { container } = render(<DaySpine orgSlug="acme" today="2026-08-18" detail={blocked} runway={runway} />)
    const text = container.textContent ?? ''
    expect(text.indexOf('Insurance expires')).toBeLessThan(text.indexOf('Ceremony at Alder'))
  })
})
