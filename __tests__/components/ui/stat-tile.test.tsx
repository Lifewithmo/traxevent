import { render, screen } from '@testing-library/react'
import { StatTile } from '@/components/ui/stat-tile'

describe('StatTile', () => {
  it('renders label, value, and note', () => {
    render(<StatTile label="Open balance" value="$2,150" note="past due" tone="alert" />)
    expect(screen.getByText('Open balance')).toBeInTheDocument()
    expect(screen.getByText('$2,150')).toBeInTheDocument()
    expect(screen.getByText('past due')).toBeInTheDocument()
  })
  it('applies tabular-nums to the value for column alignment', () => {
    render(<StatTile label="Lifetime paid" value="$18,400" />)
    expect(screen.getByText('$18,400')).toHaveClass('tabular-nums')
  })
})
