import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AcceptedState } from '@/components/proposals/AcceptedState'

describe('AcceptedState', () => {
  it('confirms who signed', () => {
    render(<AcceptedState signerName="Jane Smith" depositPaid={false} />)
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument()
  })

  it('always states what happens next', () => {
    render(<AcceptedState signerName="Jane" depositPaid={false} />)
    expect(screen.getByTestId('whats-next')).toBeInTheDocument()
  })

  it('names the org when supplied', () => {
    render(<AcceptedState signerName="Jane" depositPaid orgName="BrewTrax Coffee" />)
    expect(screen.getByText(/BrewTrax Coffee/)).toBeInTheDocument()
  })

  it('confirms a paid deposit', () => {
    render(<AcceptedState signerName="Jane" depositPaid />)
    expect(screen.getByText(/Your deposit is paid/i)).toBeInTheDocument()
  })

  it('does not claim a deposit is paid when it is not', () => {
    render(<AcceptedState signerName="Jane" depositPaid={false} />)
    expect(screen.queryByText(/deposit is paid/i)).toBeNull()
    expect(screen.getByText(/deposit request separately/i)).toBeInTheDocument()
  })
})
