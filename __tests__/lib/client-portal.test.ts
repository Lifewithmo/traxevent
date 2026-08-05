import { describe, it, expect } from 'vitest'
import { buildLeadTimeline } from '@/lib/client-portal'

describe('buildLeadTimeline', () => {
  it('marks earlier stages done and the current stage current', () => {
    const t = buildLeadTimeline('proposal')
    expect(t.map((s) => s.stage)).toEqual(['inquiry', 'consultation', 'proposal', 'closed_won', 'closed_lost'])
    expect(t.find((s) => s.stage === 'inquiry')).toMatchObject({ done: true, current: false })
    expect(t.find((s) => s.stage === 'consultation')).toMatchObject({ done: true, current: false })
    expect(t.find((s) => s.stage === 'proposal')).toMatchObject({ done: false, current: true, label: 'Proposal' })
    expect(t.find((s) => s.stage === 'closed_won')).toMatchObject({ done: false, current: false })
  })

  it('at the final stage everything before is done and closed_lost is current', () => {
    const t = buildLeadTimeline('closed_lost')
    expect(t.filter((s) => s.done).map((s) => s.stage)).toEqual(['inquiry', 'consultation', 'proposal', 'closed_won'])
    expect(t.find((s) => s.stage === 'closed_lost')).toMatchObject({ done: false, current: true })
  })
})
