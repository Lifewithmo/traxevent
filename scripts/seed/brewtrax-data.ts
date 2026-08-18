import type { BrewtraxSeed } from '@/scripts/seed/types'
import { daysFrom, isoFrom, datetimeLocalFrom } from '@/scripts/seed/dates'
import { computeSelectedTotal, depositAmount } from '@/lib/proposals'

/**
 * The BrewTrax demo tenant as a pure function of `today`. Every date is an
 * offset, so the demo reads as a currently-running business whenever it runs.
 */
export function buildBrewtraxSeed(today: Date): BrewtraxSeed {
  const org: BrewtraxSeed['org'] = {
    name: 'BrewTrax Mobile Bar',
    slug: 'brewtrax-demo',
    billing_status: 'active',
    plan: 'business',
    industry_pack_id: 'coffee-cart',
    brand_id: 'brewtrax',
    tips_enabled: true,
    created_at: isoFrom(today, -420),
  }

  const customers: BrewtraxSeed['customers'] = [
    { key: 'cust-harper', input: { name: 'Dana Harper', email: 'dana.harper@example.com', phone: '208-555-0134', company: 'Harper & Vance Weddings' } },
    { key: 'cust-oakline', input: { name: 'Marcus Oakline', email: 'marcus@oaklinetech.example.com', phone: '208-555-0177', company: 'Oakline Technologies' } },
    { key: 'cust-riverbend', input: { name: 'Priya Raman', email: 'priya@riverbendhoa.example.com', phone: '208-555-0192', company: 'Riverbend HOA' } },
    { key: 'cust-summit', input: { name: 'Jordan Ellis', email: 'jordan.ellis@summitcreative.example.com', phone: '208-555-0148', company: 'Summit Creative Co.' } },
    { key: 'cust-larkin', input: { name: 'Sam Larkin', email: 'sam.larkin@example.com', phone: '208-555-0119' } },
    { key: 'cust-benoit', input: { name: 'Camille Benoit', email: 'camille.benoit@example.com', phone: '208-555-0163' } },
    { key: 'cust-northgate', input: { name: 'Tess Alvarado', email: 'tess@northgateschool.example.com', phone: '208-555-0155', company: 'Northgate School District' } },
    { key: 'cust-piney', input: { name: 'Rowan Fitch', email: 'rowan@pineyfork.example.com', phone: '208-555-0128', company: 'Piney Fork Brewing' } },
    { key: 'cust-meridian', input: { name: 'Nina Torres', email: 'nina@meridiansummerfest.example.com', phone: '208-555-0201', company: 'Meridian Summerfest' } },
    // Off-beat repeat clients: each has 3 past won events (a clear cadence), nothing
    // booked ahead, and no invoices/AR — so the re-book radar surfaces clients who
    // are overdue on their OWN pattern (not outranked by a payment reminder).
    { key: 'cust-lakeview', input: { name: 'Erin Cole', email: 'erin@lakeviewrealty.example.com', phone: '208-555-0210', company: 'Lakeview Realty Group' } },
    { key: 'cust-ironhaus', input: { name: 'Devon Marsh', email: 'devon@ironhausgym.example.com', phone: '208-555-0221', company: 'Ironhaus CrossFit' } },
    { key: 'cust-galleria', input: { name: 'Bianca Lott', email: 'bianca@galleriaevents.example.com', phone: '208-555-0232', company: 'Galleria Event Center' } },
    // Two clients chasing the SAME Saturday — the book-by conflict-radar demo.
    { key: 'cust-brightside', input: { name: 'Maya Brightside', email: 'maya@brightsidegardens.example.com', phone: '208-555-0243', company: 'Brightside Garden Events' } },
    { key: 'cust-crestline', input: { name: 'Theo Crestline', email: 'theo@crestlinecapital.example.com', phone: '208-555-0254', company: 'Crestline Capital' } },
  ]

  const leads: BrewtraxSeed['leads'] = [
    // --- Off-beat repeat clients (re-book radar): 3 past won events each, distinct
    //     cadences, no future booking, no invoices/AR — overdue on their own pattern. ---
    { key: 'lead-lakeview-1', customerKey: 'cust-lakeview', lead: { id: 'demo-lead-12', name: 'Erin Cole', title: 'Lakeview spring open house', email: 'erin@lakeviewrealty.example.com', phone: '208-555-0210', organization: 'Lakeview Realty Group', event_type: 'Corporate', event_date: daysFrom(today, -365), estimated_value: 900, stage: 'closed_won', created_at: isoFrom(today, -391), notes: 'Open-house coffee bar. Third season running.' } },
    { key: 'lead-lakeview-2', customerKey: 'cust-lakeview', lead: { id: 'demo-lead-13', name: 'Erin Cole', title: 'Lakeview summer listing launch', email: 'erin@lakeviewrealty.example.com', phone: '208-555-0210', organization: 'Lakeview Realty Group', event_type: 'Corporate', event_date: daysFrom(today, -273), estimated_value: 950, stage: 'closed_won', created_at: isoFrom(today, -299), notes: 'Cold brew for the listing launch.' } },
    { key: 'lead-lakeview-3', customerKey: 'cust-lakeview', lead: { id: 'demo-lead-14', name: 'Erin Cole', title: 'Lakeview client appreciation', email: 'erin@lakeviewrealty.example.com', phone: '208-555-0210', organization: 'Lakeview Realty Group', event_type: 'Corporate', event_date: daysFrom(today, -180), estimated_value: 1000, stage: 'closed_won', created_at: isoFrom(today, -206), notes: 'Quarterly client-appreciation cart.' } },
    { key: 'lead-ironhaus-1', customerKey: 'cust-ironhaus', lead: { id: 'demo-lead-15', name: 'Devon Marsh', title: 'Ironhaus member challenge kickoff', email: 'devon@ironhausgym.example.com', phone: '208-555-0221', organization: 'Ironhaus CrossFit', event_type: 'Community event', event_date: daysFrom(today, -460), estimated_value: 700, stage: 'closed_won', created_at: isoFrom(today, -486), notes: 'Cold brew for the challenge kickoff.' } },
    { key: 'lead-ironhaus-2', customerKey: 'cust-ironhaus', lead: { id: 'demo-lead-16', name: 'Devon Marsh', title: 'Ironhaus summer throwdown', email: 'devon@ironhausgym.example.com', phone: '208-555-0221', organization: 'Ironhaus CrossFit', event_type: 'Community event', event_date: daysFrom(today, -335), estimated_value: 750, stage: 'closed_won', created_at: isoFrom(today, -361), notes: 'Espresso cart at the throwdown.' } },
    { key: 'lead-ironhaus-3', customerKey: 'cust-ironhaus', lead: { id: 'demo-lead-17', name: 'Devon Marsh', title: 'Ironhaus anniversary', email: 'devon@ironhausgym.example.com', phone: '208-555-0221', organization: 'Ironhaus CrossFit', event_type: 'Community event', event_date: daysFrom(today, -210), estimated_value: 800, stage: 'closed_won', created_at: isoFrom(today, -236), notes: 'Anniversary cold brew, every ~4 months.' } },
    { key: 'lead-galleria-1', customerKey: 'cust-galleria', lead: { id: 'demo-lead-18', name: 'Bianca Lott', title: 'Galleria winter gala', email: 'bianca@galleriaevents.example.com', phone: '208-555-0232', organization: 'Galleria Event Center', event_type: 'Corporate', event_date: daysFrom(today, -620), estimated_value: 1100, stage: 'closed_won', created_at: isoFrom(today, -646), notes: 'Coffee service for the winter gala.' } },
    { key: 'lead-galleria-2', customerKey: 'cust-galleria', lead: { id: 'demo-lead-19', name: 'Bianca Lott', title: 'Galleria spring showcase', email: 'bianca@galleriaevents.example.com', phone: '208-555-0232', organization: 'Galleria Event Center', event_type: 'Corporate', event_date: daysFrom(today, -435), estimated_value: 1150, stage: 'closed_won', created_at: isoFrom(today, -461), notes: 'Cold brew at the spring showcase.' } },
    { key: 'lead-galleria-3', customerKey: 'cust-galleria', lead: { id: 'demo-lead-20', name: 'Bianca Lott', title: 'Galleria summer gallery opening', email: 'bianca@galleriaevents.example.com', phone: '208-555-0232', organization: 'Galleria Event Center', event_type: 'Corporate', event_date: daysFrom(today, -250), estimated_value: 1200, stage: 'closed_won', created_at: isoFrom(today, -276), notes: 'Gallery-opening bar, twice a year.' } },
    {
      key: 'lead-harper-wedding', customerKey: 'cust-harper',
      lead: {
        id: 'demo-lead-01', name: 'Dana Harper', title: 'Harper wedding — espresso bar',
        email: 'dana.harper@example.com', phone: '208-555-0134', organization: 'Harper & Vance Weddings',
        event_type: 'Wedding', event_date: daysFrom(today, 14), estimated_value: 2400,
        stage: 'closed_won', created_at: isoFrom(today, -52),
        notes: 'Booked. 120 guests, outdoor ceremony, wants the copper cart.',
      },
    },
    {
      key: 'lead-oakline-offsite', customerKey: 'cust-oakline',
      lead: {
        id: 'demo-lead-02', name: 'Marcus Oakline', title: 'Oakline Q3 offsite — cold brew',
        email: 'marcus@oaklinetech.example.com', phone: '208-555-0177', organization: 'Oakline Technologies',
        event_type: 'Corporate offsite', event_date: daysFrom(today, 7), estimated_value: 1850,
        stage: 'closed_won', created_at: isoFrom(today, -38),
        notes: 'Repeat client, third booking this year. Invoice net 15.',
      },
    },
    {
      key: 'lead-riverbend-block', customerKey: 'cust-riverbend',
      lead: {
        id: 'demo-lead-03', name: 'Priya Raman', title: 'Riverbend block party',
        email: 'priya@riverbendhoa.example.com', phone: '208-555-0192', organization: 'Riverbend HOA',
        event_type: 'Community event', event_date: daysFrom(today, 28), estimated_value: 1600,
        stage: 'closed_won', created_at: isoFrom(today, -25),
        notes: 'HOA board approved. Needs a certificate of insurance on file.',
      },
    },
    {
      key: 'lead-summit-launch', customerKey: 'cust-summit',
      lead: {
        id: 'demo-lead-04', name: 'Jordan Ellis', title: 'Summit product launch',
        email: 'jordan.ellis@summitcreative.example.com', phone: '208-555-0148', organization: 'Summit Creative Co.',
        event_type: 'Corporate', event_date: daysFrom(today, 45), estimated_value: 3200,
        stage: 'proposal', created_at: isoFrom(today, -11),
        notes: 'Sent the three-tier proposal. Deciding between Better and Best.',
      },
    },
    {
      key: 'lead-larkin-anniversary', customerKey: 'cust-larkin',
      lead: {
        id: 'demo-lead-05', name: 'Sam Larkin', title: 'Larkin 40th anniversary',
        email: 'sam.larkin@example.com', phone: '208-555-0119',
        event_type: 'Private party', event_date: daysFrom(today, 60), estimated_value: 1100,
        stage: 'proposal', created_at: isoFrom(today, -9),
        waiting: { reason: 'Waiting on final guest count from the venue', follow_up_date: daysFrom(today, 3) },
        notes: 'Venue caps at 80 but they think 60.',
      },
    },
    {
      key: 'lead-benoit-shower', customerKey: 'cust-benoit',
      lead: {
        id: 'demo-lead-06', name: 'Camille Benoit', title: 'Benoit baby shower',
        email: 'camille.benoit@example.com', phone: '208-555-0163',
        event_type: 'Private party', event_date: daysFrom(today, 33), estimated_value: 750,
        stage: 'consultation', created_at: isoFrom(today, -6),
        notes: 'Discovery call done. Wants a decaf-forward menu.',
      },
    },
    {
      key: 'lead-northgate-staff', customerKey: 'cust-northgate',
      lead: {
        id: 'demo-lead-07', name: 'Tess Alvarado', title: 'Northgate staff appreciation day',
        email: 'tess@northgateschool.example.com', phone: '208-555-0155', organization: 'Northgate School District',
        event_type: 'Corporate', event_date: daysFrom(today, 71), estimated_value: 2100,
        stage: 'consultation', created_at: isoFrom(today, -4),
        notes: 'Purchase order process — needs a W-9 before booking.',
      },
    },
    {
      key: 'lead-piney-collab', customerKey: 'cust-piney',
      lead: {
        id: 'demo-lead-08', name: 'Rowan Fitch', title: 'Piney Fork taproom collab',
        email: 'rowan@pineyfork.example.com', phone: '208-555-0128', organization: 'Piney Fork Brewing',
        event_type: 'Collaboration', event_date: daysFrom(today, 90), estimated_value: 900,
        stage: 'inquiry', created_at: isoFrom(today, -2),
        notes: 'Inbound from the website. Monthly coffee-and-beer pop-up idea.',
      },
    },
    {
      key: 'lead-inquiry-market', customerKey: 'cust-larkin',
      lead: {
        id: 'demo-lead-09', name: 'Sam Larkin', title: 'Saturday farmers market stall',
        email: 'sam.larkin@example.com',
        event_type: 'Recurring', event_date: daysFrom(today, 21), estimated_value: 400,
        stage: 'inquiry', created_at: isoFrom(today, -1),
        notes: 'Asked about a standing weekly slot.',
      },
    },
    {
      key: 'lead-vance-gala', customerKey: 'cust-harper',
      lead: {
        id: 'demo-lead-10', name: 'Dana Harper', title: 'Vance charity gala',
        email: 'dana.harper@example.com', organization: 'Harper & Vance Weddings',
        event_type: 'Gala', event_date: daysFrom(today, -30), estimated_value: 2800,
        stage: 'closed_lost', created_at: isoFrom(today, -75),
        notes: 'Lost on price — went with an in-house caterer.',
      },
    },
    {
      // The won job behind the Meridian Summerfest event and its invoice. Both
      // used to hang off the lost Vance gala above, which put collected revenue
      // on a deal that never closed.
      key: 'lead-summerfest-vendor', customerKey: 'cust-meridian',
      lead: {
        id: 'demo-lead-11', name: 'Nina Torres', title: 'Meridian Summerfest — vendor day',
        email: 'nina@meridiansummerfest.example.com', phone: '208-555-0201', organization: 'Meridian Summerfest',
        event_type: 'Festival', event_date: daysFrom(today, -21), estimated_value: 3600,
        stage: 'closed_won', created_at: isoFrom(today, -100),
        notes: 'Delivered. Festival office short-paid the deposit and the balance is still open.',
      },
    },
    {
      // SAME-DAY BOOKING CONFLICT demo. This wedding is already BOOKED for a
      // Saturday ~18 days out (event − 14-day prep ⇒ book-by in ~4 days), and
      // the Crestline mixer below wants the very same day. A solo operator's
      // capacity is 1, so the pipeline flags the still-open Crestline deal with
      // a conflict badge and warns if you try to win it too.
      key: 'lead-brightside-wedding', customerKey: 'cust-brightside',
      lead: {
        id: 'demo-lead-21', name: 'Maya Brightside', title: 'Brightside garden wedding — espresso bar',
        email: 'maya@brightsidegardens.example.com', phone: '208-555-0243', organization: 'Brightside Garden Events',
        event_type: 'Wedding', event_date: daysFrom(today, 18), estimated_value: 2600,
        stage: 'closed_won', created_at: isoFrom(today, -40),
        notes: 'Booked. Same Saturday the Crestline mixer is chasing — capacity is one.',
      },
    },
    {
      key: 'lead-crestline-mixer', customerKey: 'cust-crestline',
      lead: {
        id: 'demo-lead-22', name: 'Theo Crestline', title: 'Crestline investor mixer — cold brew',
        email: 'theo@crestlinecapital.example.com', phone: '208-555-0254', organization: 'Crestline Capital',
        event_type: 'Corporate', event_date: daysFrom(today, 18), estimated_value: 1900,
        stage: 'consultation', created_at: isoFrom(today, -3),
        notes: 'Wants the same Saturday as the Brightside wedding — double-booking risk.',
      },
    },
  ]

  const tasks: BrewtraxSeed['tasks'] = [
    { leadKey: 'lead-summit-launch', task: { id: 'demo-task-01', title: 'Follow up on proposal tiers', due_date: daysFrom(today, -2), done: false, created_at: isoFrom(today, -9) } },
    { leadKey: 'lead-larkin-anniversary', task: { id: 'demo-task-02', title: 'Chase final guest count', due_date: daysFrom(today, 3), done: false, created_at: isoFrom(today, -8) } },
    { leadKey: 'lead-northgate-staff', task: { id: 'demo-task-03', title: 'Send W-9 to district office', due_date: daysFrom(today, 5), done: false, created_at: isoFrom(today, -3) } },
    { leadKey: 'lead-riverbend-block', task: { id: 'demo-task-04', title: 'Upload certificate of insurance', due_date: daysFrom(today, -5), done: false, created_at: isoFrom(today, -20) } },
    { leadKey: 'lead-benoit-shower', task: { id: 'demo-task-05', title: 'Draft decaf-forward menu', due_date: daysFrom(today, 9), done: false, created_at: isoFrom(today, -5) } },
    { leadKey: 'lead-harper-wedding', task: { id: 'demo-task-06', title: 'Confirm ceremony start time with venue', due_date: daysFrom(today, -12), done: true, done_at: isoFrom(today, -13), created_at: isoFrom(today, -30) } },
    { leadKey: 'lead-oakline-offsite', task: { id: 'demo-task-07', title: 'Send updated cold brew menu', due_date: daysFrom(today, -18), done: true, done_at: isoFrom(today, -19), created_at: isoFrom(today, -34) } },
  ]

  /** Calendar year of the date `n` days out — an event near a year boundary
   *  must carry its own year, not today's, or its slug misreports it. */
  const yearOf = (n: number) => Number(daysFrom(today, n).slice(0, 4))

  const summitLines = [
    { id: 'li-1', description: 'Espresso bar service — 4 hours', quantity: 1, unit_price: 1450, taxable: true },
    { id: 'li-2', description: 'Second barista', quantity: 1, unit_price: 450, taxable: true },
    { id: 'li-3', description: 'Branded cup sleeves (250)', quantity: 1, unit_price: 180, optional: true, taxable: true },
  ]
  const oaklineLines = [
    { id: 'li-1', description: 'Cold brew bar — 3 hours', quantity: 1, unit_price: 1200, taxable: true },
    { id: 'li-2', description: 'Nitro tap add-on', quantity: 1, unit_price: 350, taxable: true },
  ]
  const larkinLines = [
    { id: 'li-1', description: 'Drip coffee service — 2 hours', quantity: 1, unit_price: 650, taxable: true },
    { id: 'li-2', description: 'Pastry pairing', quantity: 60, unit_price: 4.5, optional: true, taxable: true },
  ]

  // The Oakline proposal and its deposit invoice are one story, so the money is
  // derived once here and shared. `oaklineDepositDue` is what production's
  // generateFromProposalCore would mint — depositAmount() over the TAX-AWARE
  // accepted total, not over the pre-tax subtotal.
  const oaklineTaxRate = 6
  const oaklineDeposit = { type: 'percent' as const, value: 50 }
  const oaklineAcceptedTotal = computeSelectedTotal(
    { line_items: oaklineLines, tax_rate: oaklineTaxRate },
    { optional_item_ids: [] },
  )
  const oaklineDepositDue = depositAmount(oaklineAcceptedTotal, oaklineDeposit)

  // `event_start`/`event_end` are bare `YYYY-MM-DD`, NOT full ISO datetimes.
  // The app's only writers are <Input type="date"> fields (new-event and event
  // settings), so every real Event carries a date-only string, and the readers
  // assume it: the org landing page prints `{event_start} → {event_end}` raw,
  // and the settings form loads the value straight into a date input that
  // rejects a datetime. Time of day belongs on the itinerary items, whose
  // `start_time`/`end_time` are bare `HH:mm`, and on
  // `ops.plan.requirements.service_start/end`, which are `YYYY-MM-DDTHH:mm`
  // via `datetimeLocalFrom` — NOT isoFrom either. Three fields, three formats,
  // none of them full ISO; each one matches the input that writes it.
  const events: BrewtraxSeed['events'] = [
    {
      key: 'event-oakline', event: {
        id: 'demo-event-01', name: 'Oakline Q3 Offsite', slug: `oakline-q3-offsite-${yearOf(7)}`,
        year: yearOf(7), status: 'active', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: daysFrom(today, 7), event_end: daysFrom(today, 7),
        headcount: 85, created_at: isoFrom(today, -38),
        key_contacts: [
          { name: 'Marcus Oakline', role: 'Client', phone: '208-555-0177', email: 'marcus@oaklinetech.example.com' },
          { name: 'Riley Chen', role: 'Venue coordinator', phone: '208-555-0181' },
        ],
      },
      itinerary: [
        { id: 'demo-itin-01', day: daysFrom(today, 7), start_time: '13:30', end_time: '15:00', title: 'Load in and cart setup', location: 'Oakline HQ — north lot', sort_order: 1, created_at: isoFrom(today, -20) },
        { id: 'demo-itin-02', day: daysFrom(today, 7), start_time: '15:00', end_time: '19:00', title: 'Cold brew service', location: 'Courtyard', sort_order: 2, created_at: isoFrom(today, -20) },
        { id: 'demo-itin-03', day: daysFrom(today, 7), start_time: '19:00', end_time: '20:00', title: 'Teardown', sort_order: 3, created_at: isoFrom(today, -20) },
      ],
    },
    {
      key: 'event-harper', event: {
        id: 'demo-event-02', name: 'Harper Wedding', slug: `harper-wedding-${yearOf(14)}`,
        year: yearOf(14), status: 'active', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: daysFrom(today, 14), event_end: daysFrom(today, 14),
        headcount: 120, created_at: isoFrom(today, -52),
        key_contacts: [
          { name: 'Dana Harper', role: 'Planner', phone: '208-555-0134', email: 'dana.harper@example.com' },
          { name: 'Alex Vance', role: 'Day-of coordinator', phone: '208-555-0139' },
        ],
      },
      itinerary: [
        { id: 'demo-itin-04', day: daysFrom(today, 14), start_time: '14:00', end_time: '16:00', title: 'Setup — copper cart, ceremony lawn', location: 'Wildrose Barn', sort_order: 1, created_at: isoFrom(today, -25) },
        { id: 'demo-itin-05', day: daysFrom(today, 14), start_time: '18:00', end_time: '22:00', title: 'Espresso bar — reception', location: 'Wildrose Barn', sort_order: 2, created_at: isoFrom(today, -25) },
      ],
    },
    {
      key: 'event-riverbend', event: {
        id: 'demo-event-03', name: 'Riverbend Block Party', slug: `riverbend-block-party-${yearOf(28)}`,
        year: yearOf(28), status: 'active', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: daysFrom(today, 28), event_end: daysFrom(today, 28),
        headcount: 200, created_at: isoFrom(today, -25),
        key_contacts: [{ name: 'Priya Raman', role: 'HOA board', phone: '208-555-0192', email: 'priya@riverbendhoa.example.com' }],
      },
      itinerary: [
        { id: 'demo-itin-06', day: daysFrom(today, 28), start_time: '08:30', end_time: '10:00', title: 'Setup on Riverbend Ct', sort_order: 1, created_at: isoFrom(today, -10) },
        { id: 'demo-itin-07', day: daysFrom(today, 28), start_time: '10:00', end_time: '14:00', title: 'Drip + iced service', sort_order: 2, created_at: isoFrom(today, -10) },
      ],
    },
    {
      key: 'event-summerfest', event: {
        id: 'demo-event-04', name: 'Meridian Summerfest', slug: `meridian-summerfest-${yearOf(-21)}`,
        year: yearOf(-21), status: 'archived', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: daysFrom(today, -21), event_end: daysFrom(today, -21),
        headcount: 300, created_at: isoFrom(today, -90),
        key_contacts: [{ name: 'Nina Torres', role: 'Festival ops', phone: '208-555-0201' }],
      },
      itinerary: [
        { id: 'demo-itin-08', day: daysFrom(today, -21), start_time: '09:00', end_time: '11:00', title: 'Setup — vendor row', sort_order: 1, created_at: isoFrom(today, -60) },
      ],
    },
    {
      key: 'event-vance-retreat', event: {
        id: 'demo-event-05', name: 'Vance Corporate Retreat', slug: `vance-corporate-retreat-${yearOf(-56)}`,
        year: yearOf(-56), status: 'archived', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: daysFrom(today, -56), event_end: daysFrom(today, -56),
        headcount: 45, created_at: isoFrom(today, -110),
        key_contacts: [{ name: 'Alex Vance', role: 'Client', phone: '208-555-0139' }],
      },
      itinerary: [
        { id: 'demo-itin-09', day: daysFrom(today, -56), start_time: '07:00', end_time: '08:00', title: 'Morning setup', sort_order: 1, created_at: isoFrom(today, -80) },
      ],
    },
  ]

  const proposals: BrewtraxSeed['proposals'] = [
    {
      leadKey: 'lead-summit-launch',
      proposal: {
        id: 'demo-prop-01', title: 'Summit Creative — product launch coffee service',
        status: 'sent', line_items: summitLines, tax_rate: 6,
        deposit: { type: 'percent', value: 25 }, deposit_gate: 'after_accept',
        deposit_terms: '25% deposit holds the date; balance due on completion.',
        expires_at: isoFrom(today, 6, '23:59'),
        created_at: isoFrom(today, -8), updated_at: isoFrom(today, -8),
        notes: 'Tiered options discussed on the discovery call.',
        blocks: [
          { id: 'blk-1', type: 'heading', text: 'What we bring', level: 2 },
          { id: 'blk-2', type: 'paragraph', text: 'A full mobile espresso bar, two baristas, and everything needed to serve 150 drinks in four hours.' },
          { id: 'blk-3', type: 'list', items: ['Copper mobile cart', 'Single-origin espresso + two milk options', 'Compostable cups and lids', 'Setup and teardown included'] },
        ],
        events: [
          { kind: 'sent', at: isoFrom(today, -8) }, { kind: 'viewed', at: isoFrom(today, -7) }
        ],
      },
    },
    {
      leadKey: 'lead-oakline-offsite',
      proposal: {
        id: 'demo-prop-02', title: 'Oakline Q3 offsite — cold brew bar',
        status: 'accepted', line_items: oaklineLines, tax_rate: oaklineTaxRate,
        deposit: oaklineDeposit, deposit_gate: 'after_accept',
        deposit_terms: '50% deposit due at booking.',
        // Backed by inv-oakline-deposit, which is issued after this acceptance
        // and paid in full — see the invoices block below.
        payment_status: 'deposit_paid',
        selection: { optional_item_ids: [], selected_total: oaklineAcceptedTotal, selected_at: isoFrom(today, -30) },
        client_response_at: isoFrom(today, -30),
        created_at: isoFrom(today, -35), updated_at: isoFrom(today, -30),
        events: [
          { kind: 'sent', at: isoFrom(today, -35) },
          { kind: 'viewed', at: isoFrom(today, -34) },
          { kind: 'accepted', at: isoFrom(today, -30) },
        ],
      },
    },
    {
      leadKey: 'lead-larkin-anniversary',
      proposal: {
        id: 'demo-prop-03', title: 'Larkin 40th anniversary — coffee service',
        status: 'draft', line_items: larkinLines,
        created_at: isoFrom(today, -1),
        notes: 'Hold until the guest count lands.',
      },
    },
  ]

  const invoices: BrewtraxSeed['invoices'] = [
    {
      // Carries the d31_60 aging bucket: booked well ahead, deposit short-paid,
      // job already delivered, $600 still open. Attached to the WON Summerfest
      // lead — an invoice on the lost Vance gala read as revenue from a deal
      // that never closed.
      key: 'inv-summerfest-deposit', leadKey: 'lead-summerfest-vendor', customerKey: 'cust-meridian',
      input: {
        title: 'Meridian Summerfest — vendor day deposit', type: 'deposit', due_date: daysFrom(today, -40),
        line_items: [{ description: 'Full-day drip and iced service — 50% deposit', quantity: 1, unit_price: 1800 }],
      },
      issue: { issuedAt: isoFrom(today, -55) },
      payments: [{ amount: 1200, method: 'ach', note: 'Partial — festival office paid short of the deposit' }],
    },
    {
      // The deposit behind demo-prop-02. Amount derived from the same tax-aware
      // accepted total the proposal shows, issued AFTER the proposal was
      // accepted (day -30), and paid in full — which is what the proposal's
      // `deposit_paid` status claims, on a job that is only a week out.
      key: 'inv-oakline-deposit', leadKey: 'lead-oakline-offsite', customerKey: 'cust-oakline',
      input: {
        title: 'Oakline Q3 offsite — deposit', type: 'deposit', due_date: daysFrom(today, -22),
        line_items: [{ description: 'Cold brew bar — 50% deposit', quantity: 1, unit_price: oaklineDepositDue }],
      },
      issue: { issuedAt: isoFrom(today, -29) },
      payments: [{ amount: oaklineDepositDue, method: 'ach', note: 'Deposit paid in full at booking' }],
    },
    {
      key: 'inv-harper-deposit', leadKey: 'lead-harper-wedding', customerKey: 'cust-harper',
      input: {
        title: 'Harper wedding — deposit', type: 'deposit', due_date: daysFrom(today, 2),
        line_items: [{ description: 'Espresso bar deposit', quantity: 1, unit_price: 1200 }],
      },
      issue: { issuedAt: isoFrom(today, -5) },
      payments: [],
    },
    {
      key: 'inv-riverbend-quick', leadKey: 'lead-riverbend-block', customerKey: 'cust-riverbend',
      input: {
        title: 'Riverbend block party — balance', type: 'quick', due_date: daysFrom(today, 12),
        line_items: [{ description: 'Community event service — 4 hours', quantity: 1, unit_price: 1600 }],
      },
      issue: { issuedAt: isoFrom(today, -3) },
      payments: [],
    },
    {
      key: 'inv-larkin-draft', leadKey: 'lead-larkin-anniversary', customerKey: 'cust-larkin',
      input: {
        title: 'Larkin anniversary — draft', type: 'quick',
        line_items: [{ description: 'Drip coffee service — 2 hours', quantity: 1, unit_price: 650 }],
      },
      payments: [],
    },
  ]

  const ops: BrewtraxSeed['ops'] = {
    resources: [
      { key: 'res-beans', input: { name: 'Single-origin espresso beans', kind: 'consumable', unit: 'lb', unit_cost: 14.5 } },
      { key: 'res-cups', input: { name: '12oz compostable cups', kind: 'consumable', unit: 'each', unit_cost: 0.18 } },
      { key: 'res-milk', input: { name: 'Whole milk', kind: 'consumable', unit: 'gal', unit_cost: 4.25 } },
      { key: 'res-cart', input: { name: 'Copper mobile cart', kind: 'reusable', notes: 'Primary cart — fits through a 36" doorway' } },
      { key: 'res-grinder', input: { name: 'Mahlkonig E65S grinder', kind: 'serialized', notes: 'Serial MK-2291' } },
      { key: 'res-espresso-machine', input: { name: 'La Marzocco Linea Mini', kind: 'serialized', notes: 'Serial LM-88413' } },
    ],
    workPackages: [
      {
        key: 'pkg-espresso-bar', name: 'Espresso Bar — 4 hour', price: 1450, max_guests: 150,
        scope: 'Two baristas, full espresso menu, cups and compostable lids included.',
        setup_minutes: 90, teardown_minutes: 45,
        lines: [
          { kind: 'consumable', resourceKey: 'res-beans', qty_per_guest: 0.02, base_qty: 1 },
          { kind: 'consumable', resourceKey: 'res-cups', qty_per_guest: 1.3 },
          { kind: 'consumable', resourceKey: 'res-milk', qty_per_guest: 0.05 },
          { kind: 'equipment', resourceKey: 'res-cart', qty: 1 },
          { kind: 'equipment', resourceKey: 'res-espresso-machine', qty: 1 },
          { kind: 'equipment', resourceKey: 'res-grinder', qty: 1 },
          { kind: 'labor', role: 'Barista', count: 2 },
        ],
      },
      {
        key: 'pkg-cold-brew', name: 'Cold Brew Bar — 3 hour', price: 1200, max_guests: 120,
        scope: 'Self-serve cold brew on tap with one barista attending.',
        setup_minutes: 60, teardown_minutes: 30,
        lines: [
          { kind: 'consumable', resourceKey: 'res-cups', qty_per_guest: 1.1 },
          { kind: 'equipment', resourceKey: 'res-cart', qty: 1 },
          { kind: 'labor', role: 'Barista', count: 1 },
        ],
      },
    ],
    plan: {
      eventKey: 'event-oakline',
      packageKeys: ['pkg-cold-brew'],
      requirements: {
        guests: 85,
        // datetime-local shape, not full ISO — see datetimeLocalFrom.
        service_start: datetimeLocalFrom(today, 7, '15:00'),
        service_end: datetimeLocalFrom(today, 7, '19:00'),
        site_needs: ['power', 'ice', 'parking'],
        notes: 'Load in through the north lot; badge required at the gate.',
      },
      completeStepCount: 3,
      completeDeadlineCount: 1,
    },
    issues: [
      { type: 'equipment', severity: 'medium', note: 'Grinder burrs are due for replacement — grind is running coarse.' },
      { type: 'logistics', severity: 'low', note: 'Load-in gate was locked on arrival.', resolution: 'Venue now sends a gate code with the confirmation email.' },
    ],
    complianceDocs: [
      { name: 'General liability certificate', expires_on: daysFrom(today, 24), notes: 'Renew with the broker — Riverbend HOA needs a copy.' },
      { name: 'Food handler permit — Ada County', expires_on: daysFrom(today, 210) },
      { name: 'Mobile vendor license', expires_on: daysFrom(today, 145) },
    ],
  }

  return { org, customers, leads, tasks, events, proposals, invoices, ops }
}
