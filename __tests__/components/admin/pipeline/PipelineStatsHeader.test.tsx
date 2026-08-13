import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PipelineStatsHeader } from '@/components/admin/pipeline/PipelineStatsHeader'

const stats = {
  bookedThisMonth: { count: 2, value: 6300 },
  bookedLastYearSameMonth: { count: 1, value: 5385 },
  bookedNext90: { count: 5, value: 18450 },
  openPipeline: { count: 5, value: 16350 },
  needsActionCount: 2,
  todayYm: '2026-08',
  backlog: Array.from({ length: 12 }, (_, i) => ({
    ym: `2026-${String(i + 1).padStart(2, '0')}`,
    label: 'M',
    booked: i === 7 ? 1000 : 0,
    open: i === 7 ? 500 : 0,
  })),
}

describe('PipelineStatsHeader', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders all four KPIs including open pipeline', () => {
    render(<PipelineStatsHeader stats={stats} />)
    expect(screen.getByText('Booked this month')).toBeInTheDocument()
    expect(screen.getByText('Open pipeline')).toBeInTheDocument()
    expect(screen.getByText('$16,350')).toBeInTheDocument()
    expect(screen.getByText('5 opportunities')).toBeInTheDocument()
    expect(screen.getByText('up 17% vs this month last year')).toBeInTheDocument()
  })

  it('renders the needs-action note as stale or unopened', () => {
    render(<PipelineStatsHeader stats={stats} />)
    expect(screen.getByText('stale or unopened')).toBeInTheDocument()
  })

  it('starts with the chart collapsed showing the summary, expands to the legend', () => {
    render(<PipelineStatsHeader stats={stats} />)
    expect(screen.getByText(/booked · .* ahead/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Revenue by month/i }))
    expect(screen.getByText('rolling 12 months · solid booked · light open')).toBeInTheDocument()
    expect(localStorage.getItem('tx-backlog-open')).toBe('1')
  })
})
