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

  it('renders the destructive color, not muted, when YoY is down', () => {
    const downStats = {
      ...stats,
      bookedThisMonth: { count: 2, value: 5000 },
      bookedLastYearSameMonth: { count: 1, value: 6000 },
    }
    render(<PipelineStatsHeader stats={downStats} />)
    const note = screen.getByText('down 17% vs this month last year')
    expect(note.className).toContain('text-destructive')
    expect(note.className).not.toContain('text-muted-foreground')
  })

  it('lays the four figures out in the shared kit KPI band', () => {
    const { container } = render(<PipelineStatsHeader stats={stats} />)
    expect(container.querySelectorAll('[data-slot="kpi-band"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-slot="stat-tile"]')).toHaveLength(4)
  })

  it('paints every money figure with the money token', () => {
    render(<PipelineStatsHeader stats={stats} />)
    for (const figure of ['$6,300', '$18,450', '$16,350']) {
      expect(screen.getByText(figure).className).toContain('var(--money-green)')
    }
  })

  it('paints the needs-action figure in alert tone while work is waiting', () => {
    render(<PipelineStatsHeader stats={stats} />)
    expect(screen.getByText('2').className).toContain('text-destructive')
    expect(screen.getByText('stale or unopened').className).toContain('text-destructive')
  })

  it('drops the alert tone once the queue is clear', () => {
    render(<PipelineStatsHeader stats={{ ...stats, needsActionCount: 0 }} />)
    expect(screen.getByText('0').className).not.toContain('text-destructive')
    expect(screen.getByText('all caught up').className).toContain('text-muted-foreground')
  })
})
