import { describe, it, expect } from 'vitest'
import { buildBrewtraxSeed } from '@/scripts/seed/brewtrax-data'
import { LEAD_STAGES } from '@/lib/leads'
import { proposalTotal } from '@/lib/proposals'

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
    expect(accepted.proposal.selection!.selected_total)
      .toBe(proposalTotal(accepted.proposal.line_items))
  })
})
