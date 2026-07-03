import { describe, it, expect } from 'vitest'
import { buildLeadTimeline } from '@/lib/client-portal'

describe('buildLeadTimeline', () => {
  it('marks earlier stages done and the current stage current', () => {
    const t = buildLeadTimeline('proposal')
    expect(t.map((s) => s.stage)).toEqual(['inquiry', 'consultation', 'proposal', 'booked', 'delivered'])
    expect(t.find((s) => s.stage === 'inquiry')).toMatchObject({ done: true, current: false })
    expect(t.find((s) => s.stage === 'consultation')).toMatchObject({ done: true, current: false })
    expect(t.find((s) => s.stage === 'proposal')).toMatchObject({ done: false, current: true, label: 'Proposal' })
    expect(t.find((s) => s.stage === 'booked')).toMatchObject({ done: false, current: false })
  })

  it('at the final stage everything before is done and delivered is current', () => {
    const t = buildLeadTimeline('delivered')
    expect(t.filter((s) => s.done).map((s) => s.stage)).toEqual(['inquiry', 'consultation', 'proposal', 'booked'])
    expect(t.find((s) => s.stage === 'delivered')).toMatchObject({ done: false, current: true })
  })
})
