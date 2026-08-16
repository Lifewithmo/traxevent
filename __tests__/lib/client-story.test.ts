import { describe, it, expect } from 'vitest'
import { buildClientRow } from '@/lib/crm/client-list'
import { buildClientStory, buildTimeline, todayDividerIndex } from '@/lib/crm/client-story'
import type { Customer, Lead } from '@/lib/types'

const today = '2026-08-05'

const customer: Customer = { id: 'c', name: 'Dana Kim', created_at: '2026-01-01T00:00:00.000Z' }
const lead = (over: Partial<Lead>): Lead => ({
  id: 'l', name: 'Dana Kim', stage: 'inquiry', created_at: '2026-01-01T00:00:00.000Z', ...over,
})
const won = (id: string, event_date: string, value = 1000, extra: Partial<Lead> = {}): Lead =>
  lead({ id, stage: 'closed_won', event_date, estimated_value: value, ...extra })

const story = (leads: Lead[]) => buildClientStory(buildClientRow(customer, leads, today), leads)

describe('buildClientStory', () => {
  it('a brand-new client has no story', () => {
    expect(story([]).parts).toEqual([])
  })

  it('leads with the booked history and flags long silence', () => {
    const s = story([won('a', '2025-01-10', 2000), won('b', '2025-06-10', 500)])
    expect(s.parts[0]).toBe('2 events since Jan 2025, $2,500 booked')
    expect(s.parts).toContain('nothing booked in 13 months')
    expect(s.dormant).toBe(true)
  })

  it('a booked future event replaces the silence claim', () => {
    const s = story([won('a', '2025-06-10'), won('b', '2026-10-01')])
    expect(s.parts).toContain('next one booked for Oct 2026')
    expect(s.parts.join(' ')).not.toContain('nothing booked')
    expect(s.dormant).toBe(false)
  })

  it('mentions cadence and a climbing guest count when the data supports them', () => {
    const s = story([
      won('a', '2025-01-10', 1000, { guest_count: 40 }),
      won('b', '2025-04-10', 1000, { guest_count: 60 }),
      won('c', '2025-07-10', 1000, { guest_count: 90 }),
    ])
    expect(s.parts).toContain('books quarterly')
    expect(s.parts).toContain('guest count climbing 40 → 60 → 90')
  })

  it('narrates a single open opportunity with its waiting state', () => {
    const s = story([
      lead({ id: 'o1', title: 'Fall gala', stage: 'proposal', event_date: '2026-10-12', waiting: { reason: 'signature' } }),
    ])
    expect(s.parts).toContain('one still open: Fall gala on 10-12, waiting on signature')
  })

  it('sums multiple open opportunities instead of listing them', () => {
    const s = story([
      lead({ id: 'o1', stage: 'proposal', estimated_value: 300 }),
      lead({ id: 'o2', stage: 'consultation', estimated_value: 200 }),
    ])
    expect(s.parts).toContain('2 open, $500')
  })
})

describe('buildTimeline', () => {
  it('classifies entries and sorts newest-first', () => {
    const entries = buildTimeline(
      [
        won('past', '2025-06-10', 800, { guest_count: 50 }),
        won('future', '2026-09-01', 1200),
        lead({ id: 'open', title: 'Tasting', stage: 'consultation', event_date: '2026-08-20', waiting: { reason: 'menu' } }),
        lead({ id: 'lost', stage: 'closed_lost', event_date: '2025-09-01', lost: { reason: 'went_elsewhere' } }),
      ],
      today
    )
    expect(entries.map((e) => e.leadId)).toEqual(['future', 'open', 'lost', 'past'])
    expect(entries[0].kind).toBe('booked')
    expect(entries[0].detail).toBe('Booked')
    expect(entries[1].kind).toBe('open')
    expect(entries[1].detail).toContain('waiting on menu')
    expect(entries[2].kind).toBe('lost')
    expect(entries[2].detail).toBe('Lost · went elsewhere')
    expect(entries[3].kind).toBe('past')
    expect(entries[3].detail).toBe('Delivered · 50 guests')
  })

  it('places the today divider between future and past entries', () => {
    const entries = buildTimeline([won('future', '2026-09-01'), won('past', '2025-06-10')], today)
    expect(todayDividerIndex(entries, today)).toBe(1)
  })

  it('puts the divider at the end when everything is upcoming', () => {
    const entries = buildTimeline([won('future', '2026-09-01')], today)
    expect(todayDividerIndex(entries, today)).toBe(1)
  })
})
