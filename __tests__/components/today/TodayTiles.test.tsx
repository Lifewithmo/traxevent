import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodayTiles } from '@/components/admin/today/TodayTiles'

describe('TodayTiles', () => {
  it('renders the three metrics', () => {
    render(<TodayTiles tasksDue={3} needsAttention={2} openPipelineValue={1500} />)
    expect(screen.getByText('Tasks due')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Open pipeline')).toBeInTheDocument()
    expect(screen.getByText('$1500.00')).toBeInTheDocument()
  })
})
