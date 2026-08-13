import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineStatsHeader } from '@/components/admin/pipeline/PipelineStatsHeader'

const stats = {
  bookedThisMonth: { count: 2, value: 6300 },
  bookedLastYearSameMonth: { count: 1, value: 5385 },
  bookedNext90: { count: 5, value: 18450 },
  openPipeline: { count: 5, value: 16350 },
  needsActionCount: 2,
  backlog: Array.from({ length: 12 }, (_, i) => ({
    ym: `2026-${String(i + 1).padStart(2, '0')}`, label: 'M', booked: 0, open: 0,
  })),
}

describe('PipelineStatsHeader', () => {
  it('renders all four KPIs including open pipeline', () => {
    render(<PipelineStatsHeader stats={stats} />)
    expect(screen.getByText('Booked this month')).toBeInTheDocument()
    expect(screen.getByText('Open pipeline')).toBeInTheDocument()
    expect(screen.getByText('$16,350')).toBeInTheDocument()
    expect(screen.getByText('5 opportunities')).toBeInTheDocument()
    expect(screen.getByText('up 17% vs this month last year')).toBeInTheDocument()
  })

  it('titles the chart Revenue by month with the rolling-12 legend', () => {
    render(<PipelineStatsHeader stats={stats} />)
    expect(screen.getByText('Revenue by month')).toBeInTheDocument()
    expect(screen.getByText('rolling 12 months · solid booked · light open')).toBeInTheDocument()
  })
})
