import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn(), snoozeTask: vi.fn() }))
vi.mock('@/actions/leads', () => ({ setLeadWaiting: vi.fn(), clearLeadWaiting: vi.fn() }))

import { TodayClient } from '@/components/admin/today/TodayClient'
import type { TodayData } from '@/lib/today'
import type { Agenda } from '@/lib/today-moves'

const data: TodayData = {
  tiles: { tasksDue: 1, needsAttention: 1, openPipelineValue: 500 },
  needsAttention: [{ leadId: 'l1', title: 'Ann', stage: 'inquiry' }],
  dueTasks: [{ task: { id: 't1', lead_id: 'l1', title: 'Call', due_date: '2026-08-05', done: false, created_at: '' }, leadId: 'l1', leadTitle: 'Ann', status: 'today' }],
  waiting: [],
  wonUnscheduled: [],
}

const agenda: Agenda = {
  today: [{ eventId: 'e1', slug: 'gala', name: 'Gala', date: '2026-08-05', daysUntil: 0, multiDay: false }],
  upcoming: [],
  windowDays: ['2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12'],
}

describe('TodayClient', () => {
  it('counts moves and today’s events in the header', () => {
    render(<TodayClient orgId="o1" orgSlug="acme" data={data} agenda={agenda} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/2 moves/)).toBeInTheDocument()
    expect(screen.getByText(/1 event today/)).toBeInTheDocument()
  })

  it('mounts the queue and the agenda rail with the pinned next job', () => {
    render(<TodayClient orgId="o1" orgSlug="acme" data={data} agenda={agenda} />)
    expect(screen.getByText('Due today · 1')).toBeInTheDocument()
    expect(screen.getByText('Next job')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Gala/ })).toHaveAttribute('href', '/acme/gala/dashboard')
  })

  it('puts the rail before the queue in DOM order — rail on top below md, queue first at md+ via order classes', () => {
    const { container } = render(<TodayClient orgId="o1" orgSlug="acme" data={data} agenda={agenda} />)
    const aside = container.querySelector('aside')
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(aside).not.toBeNull()
    // The rail (aside) precedes the queue column in the DOM = first on phones.
    expect(aside!.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The queue column reclaims the left slot on md+ screens.
    expect(h1.closest('.md\\:order-first')).not.toBeNull()
  })

  it('renders the KPI band', () => {
    render(<TodayClient orgId="o1" orgSlug="acme" data={data} agenda={agenda} />)
    expect(screen.getByText('Open pipeline')).toBeInTheDocument()
  })
})
