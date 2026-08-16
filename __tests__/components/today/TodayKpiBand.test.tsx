import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TodayKpiBand } from '@/components/admin/today/TodayKpiBand'

describe('TodayKpiBand', () => {
  it('renders labels and values for all four tiles', () => {
    render(
      <TodayKpiBand
        tiles={{ tasksDue: 3, needsAttention: 0, openPipelineValue: 42000 }}
        eventsToday={2}
      />
    )
    expect(screen.getByText('Open pipeline')).toBeInTheDocument()
    expect(screen.getByText('$42,000')).toBeInTheDocument()
    expect(screen.getByText('Tasks due')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Events today')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('defaults eventsToday to 0 when omitted', () => {
    render(<TodayKpiBand tiles={{ tasksDue: 0, needsAttention: 0, openPipelineValue: 0 }} />)
    expect(screen.getByText('Events today')).toBeInTheDocument()
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('uses alert tone for Needs attention when > 0, default tone when 0', () => {
    const { rerender } = render(
      <TodayKpiBand tiles={{ tasksDue: 0, needsAttention: 4, openPipelineValue: 0 }} />
    )
    expect(screen.getByText('4')).toHaveClass('text-destructive')

    rerender(<TodayKpiBand tiles={{ tasksDue: 0, needsAttention: 0, openPipelineValue: 0 }} />)
    expect(screen.getByText('Needs attention').closest('[data-slot="stat-tile"]')).not.toHaveClass(
      'text-destructive'
    )
  })
})
