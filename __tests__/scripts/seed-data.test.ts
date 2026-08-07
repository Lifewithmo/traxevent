import { describe, it, expect } from 'vitest'
import { buildBrewtraxSeed } from '@/scripts/seed/brewtrax-data'
import { LEAD_STAGES } from '@/lib/leads'

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
