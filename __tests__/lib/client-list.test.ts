import { describe, it, expect } from 'vitest'
import { buildClientRow, buildClientList, cadenceLabel, lastEventLabel } from '@/lib/crm/client-list'
import type { Customer, Lead } from '@/lib/types'

const today = '2026-08-05'

const customer = (over: Partial<Customer>): Customer => ({
  id: 'c', name: 'Dana Kim', created_at: '2026-01-01T00:00:00.000Z', ...over,
})
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l', name: 'Dana Kim', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over,
})

const won = (id: string, event_date: string, value = 1000): Lead =>
  lead({ id, stage: 'closed_won', event_date, estimated_value: value })

describe('buildClientRow', () => {
  it('repeat client with nothing booked lands in dormant_repeat', () => {
    const row = buildClientRow(customer({}), [won('a', '2025-06-10'), won('b', '2025-12-10')], today)
    expect(row.group).toBe('dormant_repeat')
    expect(row.lastEventDate).toBe('2025-12-10')
    expect(row.nextEventDate).toBeUndefined()
    expect(row.monthsSinceLastEvent).toBe(7)
  })

  it('a future won event keeps them in booked_now', () => {
    const row = buildClientRow(customer({}), [won('a', '2025-12-10'), won('b', '2026-09-01')], today)
    expect(row.group).toBe('booked_now')
    expect(row.nextEventDate).toBe('2026-09-01')
  })

  it('an open opportunity keeps them in booked_now even with no wins', () => {
    const row = buildClientRow(customer({}), [lead({ stage: 'proposal', title: 'Gala' })], today)
    expect(row.group).toBe('booked_now')
    expect(row.detail).toContain('Gala')
  })

  it('no history at all is never_booked', () => {
    expect(buildClientRow(customer({}), [], today).group).toBe('never_booked')
  })

  it('cadence appears at three or more won events', () => {
    const two = buildClientRow(customer({}), [won('a', '2025-01-10'), won('b', '2025-04-10')], today)
    expect(two.cadenceMonths).toBeUndefined()
    const three = buildClientRow(
      customer({}),
      [won('a', '2025-01-10'), won('b', '2025-04-10'), won('c', '2025-07-10')],
      today
    )
    expect(three.cadenceMonths).toBe(3)
    expect(cadenceLabel(three)).toBe('quarterly')
    expect(three.detail).toContain('3 events · quarterly')
  })

  it('company-first identity puts the contact name in the detail line', () => {
    const row = buildClientRow(customer({ company: 'Riverside' }), [], today)
    expect(row.detail).toBe('Dana Kim')
  })
})

describe('cadenceLabel wording', () => {
  const withCadence = (m: number) => ({ cadenceMonths: m }) as Parameters<typeof cadenceLabel>[0]
  it('maps common cadences to plain words', () => {
    expect(cadenceLabel(withCadence(1))).toBe('monthly')
    expect(cadenceLabel(withCadence(3))).toBe('quarterly')
    expect(cadenceLabel(withCadence(6))).toBe('twice a year')
    expect(cadenceLabel(withCadence(12))).toBe('yearly')
    expect(cadenceLabel(withCadence(5))).toBe('about every 5 months')
  })
})

describe('lastEventLabel', () => {
  it('speaks in months and years, or an em dash', () => {
    expect(lastEventLabel(buildClientRow(customer({}), [], today))).toBe('—')
    expect(lastEventLabel(buildClientRow(customer({}), [won('a', '2026-08-01')], today))).toBe('This month')
    expect(lastEventLabel(buildClientRow(customer({}), [won('a', '2026-07-01')], today))).toBe('1 month ago')
    expect(lastEventLabel(buildClientRow(customer({}), [won('a', '2025-02-01')], today))).toBe('1y 6mo ago')
  })
})

describe('buildClientList', () => {
  it('orders groups dormant-first and computes the header stats', () => {
    const dormant = customer({ id: 'd', name: 'Dormant' })
    const booked = customer({ id: 'b', name: 'Booked' })
    const fresh = customer({ id: 'f', name: 'Fresh' })
    const data = buildClientList(
      {
        customers: [fresh, booked, dormant],
        leadsByCustomerId: {
          d: [won('d1', '2025-01-10', 2000), won('d2', '2025-06-10', 500)],
          b: [lead({ id: 'b1', stage: 'consultation', estimated_value: 300 })],
        },
      },
      today
    )
    expect(data.blocks.map((b) => b.group)).toEqual(['dormant_repeat', 'booked_now', 'never_booked'])
    expect(data.blocks[0].tone).toBe('urgent')
    expect(data.total).toBe(3)
    expect(data.lifetimeValue).toBe(2500)
    expect(data.worthACall).toBe(1)
    expect(data.repeat).toBe(1)
  })

  it('within a group, longest-quiet comes first', () => {
    const older = customer({ id: 'o', name: 'Older' })
    const newer = customer({ id: 'n', name: 'Newer' })
    const data = buildClientList(
      {
        customers: [newer, older],
        leadsByCustomerId: {
          o: [won('o1', '2024-01-10'), won('o2', '2024-06-10')],
          n: [won('n1', '2025-01-10'), won('n2', '2025-06-10')],
        },
      },
      today
    )
    expect(data.blocks[0].rows.map((r) => r.customer.id)).toEqual(['o', 'n'])
  })
})
