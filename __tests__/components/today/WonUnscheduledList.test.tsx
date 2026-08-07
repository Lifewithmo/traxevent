import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { WonUnscheduledList } from '@/components/admin/today/WonUnscheduledList'
import type { WonUnscheduledItem } from '@/lib/today'

const item: WonUnscheduledItem = {
  leadId: 'l1',
  title: 'Nguyen Wedding',
  company: 'Riverside',
  eventDate: '2026-09-12',
  value: 1500,
}

describe('WonUnscheduledList', () => {
  it('links each row to its opportunity', () => {
    render(<WonUnscheduledList orgSlug="acme" items={[item]} />)
    expect(screen.getByRole('link', { name: /nguyen wedding/i })).toHaveAttribute('href', '/acme/leads/l1')
  })

  it('shows the job date and value', () => {
    render(<WonUnscheduledList orgSlug="acme" items={[item]} />)
    expect(screen.getByText(/2026-09-12/)).toBeInTheDocument()
    expect(screen.getByText(/\$1,500/)).toBeInTheDocument()
  })

  it('reads "No date set" when the opportunity has none', () => {
    render(<WonUnscheduledList orgSlug="acme" items={[{ ...item, eventDate: undefined }]} />)
    expect(screen.getByText(/no date set/i)).toBeInTheDocument()
  })

  it('renders an empty state', () => {
    render(<WonUnscheduledList orgSlug="acme" items={[]} />)
    expect(screen.getByText(/every won deal is scheduled/i)).toBeInTheDocument()
  })
})
