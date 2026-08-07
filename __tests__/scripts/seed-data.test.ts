import { describe, it, expect } from 'vitest'
import { buildBrewtraxSeed } from '@/scripts/seed/brewtrax-data'
import { LEAD_STAGES } from '@/lib/leads'
import { computeSelectedTotal } from '@/lib/proposals'
import { invoiceBalance } from '@/lib/invoices'
import { deriveAging } from '@/lib/invoice-status'

const TODAY = new Date('2026-08-06T12:00:00.000Z')

describe('buildBrewtraxSeed — CRM slice', () => {
  it('produces an org scoped to the coffee-cart pack and brewtrax brand', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(seed.org.industry_pack_id).toBe('coffee-cart')
    expect(seed.org.brand_id).toBe('brewtrax')
    expect(seed.org.plan).toBe('business')
    expect(seed.org.billing_status).toBe('active')
  })

  it('covers every lead stage', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const stages = new Set(seed.leads.map((l) => l.lead.stage))
    for (const stage of LEAD_STAGES) expect(stages).toContain(stage)
  })

  it('gives every lead a customer that exists in the graph', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const customerKeys = new Set(seed.customers.map((c) => c.key))
    for (const lead of seed.leads) expect(customerKeys).toContain(lead.customerKey)
  })

  it('gives every task a lead that exists in the graph', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const leadKeys = new Set(seed.leads.map((l) => l.key))
    for (const task of seed.tasks) expect(leadKeys).toContain(task.leadKey)
  })

  it('uses unique lead keys and unique lead ids', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(new Set(seed.leads.map((l) => l.key)).size).toBe(seed.leads.length)
    expect(new Set(seed.leads.map((l) => l.lead.id)).size).toBe(seed.leads.length)
  })

  it('marks at least one lead as waiting so the stalled treatment is visible', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(seed.leads.some((l) => l.lead.waiting?.reason)).toBe(true)
  })

  it('has both overdue and upcoming open tasks relative to today', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const open = seed.tasks.filter((t) => !t.task.done && t.task.due_date)
    expect(open.some((t) => t.task.due_date! < '2026-08-06')).toBe(true)
    expect(open.some((t) => t.task.due_date! > '2026-08-06')).toBe(true)
  })

  it('is deterministic — same input, identical output', () => {
    expect(buildBrewtraxSeed(TODAY)).toEqual(buildBrewtraxSeed(TODAY))
  })

  it('shifts with today rather than hardcoding dates', () => {
    const later = buildBrewtraxSeed(new Date('2027-01-15T12:00:00.000Z'))
    const openLater = later.tasks.filter((t) => !t.task.done && t.task.due_date)
    expect(openLater.some((t) => t.task.due_date! > '2027-01-15')).toBe(true)
  })
})

describe('buildBrewtraxSeed — events and proposals', () => {
  it('has three active upcoming jobs and two archived past jobs', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const upcoming = seed.events.filter((e) => e.event.event_start > '2026-08-06')
    const past = seed.events.filter((e) => e.event.event_start < '2026-08-06')
    expect(upcoming).toHaveLength(3)
    expect(past).toHaveLength(2)
    expect(upcoming.every((e) => e.event.status === 'active')).toBe(true)
    expect(past.every((e) => e.event.status === 'archived')).toBe(true)
  })

  it('gives every upcoming job a headcount and at least one key contact', () => {
    const seed = buildBrewtraxSeed(TODAY)
    for (const e of seed.events.filter((e) => e.event.event_start > '2026-08-06')) {
      expect(e.event.headcount).toBeGreaterThan(0)
      expect(e.event.key_contacts?.length ?? 0).toBeGreaterThan(0)
    }
  })

  // The app's only event-date writers are <Input type="date"> fields, so every
  // real Event carries a bare YYYY-MM-DD. The org landing page prints these raw
  // and event settings loads them into a date input, which rejects a datetime.
  it('writes event dates in the bare YYYY-MM-DD form the app itself produces', () => {
    const seed = buildBrewtraxSeed(TODAY)
    for (const e of seed.events) {
      expect(e.event.event_start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.event.event_end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('scopes every itinerary item to a day within its own event', () => {
    const seed = buildBrewtraxSeed(TODAY)
    for (const e of seed.events) {
      for (const item of e.itinerary) {
        expect(item.day >= e.event.event_start.slice(0, 10)).toBe(true)
        expect(item.day <= e.event.event_end.slice(0, 10)).toBe(true)
      }
    }
  })

  it('covers draft, sent, and accepted proposal statuses', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const statuses = new Set(seed.proposals.map((p) => p.proposal.status))
    expect(statuses).toContain('draft')
    expect(statuses).toContain('sent')
    expect(statuses).toContain('accepted')
  })

  it('points every proposal at a lead in the graph', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const leadKeys = new Set(seed.leads.map((l) => l.key))
    for (const p of seed.proposals) expect(leadKeys).toContain(p.leadKey)
  })

  it('gives the sent proposal an expiry in the near future', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const sent = seed.proposals.find((p) => p.proposal.status === 'sent')
    expect(sent?.proposal.expires_at).toBeDefined()
    expect(sent!.proposal.expires_at! > TODAY.toISOString()).toBe(true)
  })

  it('gives the accepted proposal a deposit and a selection whose total is the real computed total', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const accepted = seed.proposals.find((p) => p.proposal.status === 'accepted')!
    expect(accepted.proposal.deposit).toBeDefined()
    expect(accepted.proposal.selection).toBeDefined()
    expect(accepted.proposal.selection!.selected_total).toBe(
      computeSelectedTotal(accepted.proposal, { optional_item_ids: [] }),
    )
  })
})

describe('buildBrewtraxSeed — invoices', () => {
  it('points every invoice at a lead and a customer in the graph', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const leadKeys = new Set(seed.leads.map((l) => l.key))
    const customerKeys = new Set(seed.customers.map((c) => c.key))
    for (const inv of seed.invoices) {
      expect(leadKeys).toContain(inv.leadKey)
      expect(customerKeys).toContain(inv.customerKey)
    }
  })

  it('covers the aging buckets the demo is meant to show', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const buckets = new Set(
      seed.invoices
        .filter((inv) => inv.issue)
        .map((inv) => {
          const balance = invoiceBalance({
            line_items: inv.input.line_items ?? [],
            payments: inv.payments.map((p) => ({ amount: p.amount, recorded_at: TODAY.toISOString() })),
          })
          return deriveAging({ dueDate: inv.input.due_date, balance, lifecycle: 'issued' }, TODAY)
        }),
    )
    expect(buckets).toContain('current')   // paid in full
    expect(buckets).toContain('due_soon')
    expect(buckets).toContain('d31_60')
  })

  it('has exactly one draft, one fully paid, and one partially paid invoice', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(seed.invoices.filter((i) => !i.issue)).toHaveLength(1)

    const paidStates = seed.invoices.filter((i) => i.issue).map((inv) => {
      const due = (inv.input.line_items ?? []).reduce((s, li) => s + li.quantity * li.unit_price, 0)
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
      return paid === 0 ? 'unpaid' : paid >= due ? 'paid' : 'partial'
    })
    expect(paidStates.filter((s) => s === 'paid')).toHaveLength(1)
    expect(paidStates.filter((s) => s === 'partial')).toHaveLength(1)
  })

  it('never records a payment larger than the invoice total', () => {
    const seed = buildBrewtraxSeed(TODAY)
    for (const inv of seed.invoices) {
      const due = (inv.input.line_items ?? []).reduce((s, li) => s + li.quantity * li.unit_price, 0)
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
      expect(paid).toBeLessThanOrEqual(due)
    }
  })
})

describe('buildBrewtraxSeed — ops', () => {
  it('covers all three resource kinds', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const kinds = new Set(seed.ops.resources.map((r) => r.input.kind))
    expect(kinds).toContain('consumable')
    expect(kinds).toContain('reusable')
    expect(kinds).toContain('serialized')
  })

  it('references only resource keys that exist', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const resourceKeys = new Set(seed.ops.resources.map((r) => r.key))
    for (const pkg of seed.ops.workPackages) {
      for (const line of pkg.lines) {
        if (line.kind === 'labor') continue
        expect(resourceKeys).toContain(line.resourceKey)
      }
    }
  })

  // RequirementsCard edits these through <Input type="datetime-local">, which
  // rejects a trailing Z and renders empty, and prints them raw when not editing.
  it('writes service times in the datetime-local form the requirements form produces', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(seed.ops.plan.requirements.service_start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(seed.ops.plan.requirements.service_end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('attaches the ops plan to an upcoming event with a positive guest count', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const event = seed.events.find((e) => e.key === seed.ops.plan.eventKey)
    expect(event).toBeDefined()
    expect(event!.event.event_start > TODAY.toISOString()).toBe(true)
    expect(seed.ops.plan.requirements.guests).toBeGreaterThan(0)
  })

  it('references only work package keys that exist', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const pkgKeys = new Set(seed.ops.workPackages.map((p) => p.key))
    for (const key of seed.ops.plan.packageKeys) expect(pkgKeys).toContain(key)
  })

  it('has one open and one resolved issue', () => {
    const seed = buildBrewtraxSeed(TODAY)
    expect(seed.ops.issues.filter((i) => !i.resolution)).toHaveLength(1)
    expect(seed.ops.issues.filter((i) => i.resolution)).toHaveLength(1)
  })

  it('has a compliance doc expiring within 60 days', () => {
    const seed = buildBrewtraxSeed(TODAY)
    const soon = new Date(TODAY.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    expect(seed.ops.complianceDocs.some((d) => d.expires_on && d.expires_on <= soon)).toBe(true)
  })
})
