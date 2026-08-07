import type { BrewtraxSeed } from '@/scripts/seed/types'
import { daysFrom, isoFrom } from '@/scripts/seed/dates'

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

  return { org, customers, leads, tasks }
}
