import type { BrewtraxSeed } from '@/scripts/seed/types'
import { daysFrom, isoFrom } from '@/scripts/seed/dates'
import { computeSelectedTotal } from '@/lib/proposals'

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
  ]

  const leads: BrewtraxSeed['leads'] = [
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

  const events: BrewtraxSeed['events'] = [
    {
      key: 'event-oakline', event: {
        id: 'demo-event-01', name: 'Oakline Q3 Offsite', slug: `oakline-q3-offsite-${yearOf(7)}`,
        year: yearOf(7), status: 'active', registration_type: 'individual', event_type_id: 'event',
        features: { accommodations: false, teams: false, budget: true, itinerary: true, communicate: true },
        event_start: isoFrom(today, 7, '15:00'), event_end: isoFrom(today, 7, '19:00'),
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
        event_start: isoFrom(today, 14, '16:00'), event_end: isoFrom(today, 14, '22:00'),
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
        event_start: isoFrom(today, 28, '10:00'), event_end: isoFrom(today, 28, '14:00'),
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
        event_start: isoFrom(today, -21, '11:00'), event_end: isoFrom(today, -21, '17:00'),
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
        event_start: isoFrom(today, -56, '08:00'), event_end: isoFrom(today, -56, '12:00'),
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
        status: 'accepted', line_items: oaklineLines, tax_rate: 6,
        deposit: { type: 'percent', value: 50 }, deposit_gate: 'after_accept',
        deposit_terms: '50% deposit due at booking.',
        payment_status: 'deposit_paid',
        selection: { optional_item_ids: [], selected_total: computeSelectedTotal({ line_items: oaklineLines, tax_rate: 6 }, { optional_item_ids: [] }), selected_at: isoFrom(today, -30) },
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

  return { org, customers, leads, tasks, events, proposals }
}
