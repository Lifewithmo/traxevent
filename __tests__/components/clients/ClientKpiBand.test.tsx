import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ClientKpiBand } from '@/components/admin/clients/ClientKpiBand'

describe('ClientKpiBand', () => {
  it('shows AR money (paid + open balance), not quoted pipeline value', () => {
    render(
      <ClientKpiBand
        ar={{ invoiced: 6000, paid: 4200, outstanding: 1800, overdueAmount: 1800, openCount: 1 }}
        rollup={{ openCount: 1, wonCount: 3, lostCount: 0, totalWonValue: 99999, openValue: 88888, lastContactAt: '2026-08-15T00:00:00Z' }}
      />
    )
    expect(screen.getByText('$4,200')).toBeInTheDocument() // Lifetime paid = ar.paid
    expect(screen.getByText('$1,800')).toBeInTheDocument() // Open balance = ar.outstanding
    expect(screen.queryByText('$99,999')).not.toBeInTheDocument() // never totalWonValue
  })

  it('shows "not yet due" (not "nothing outstanding") for an open balance that is not overdue', () => {
    render(
      <ClientKpiBand
        ar={{ invoiced: 1500, paid: 0, outstanding: 1500, overdueAmount: 0, openCount: 1 }}
        rollup={{ openCount: 1, wonCount: 0, lostCount: 0, totalWonValue: 0, openValue: 1500 }}
      />
    )
    expect(screen.getByText('not yet due')).toBeInTheDocument()
    expect(screen.queryByText('nothing outstanding')).not.toBeInTheDocument()
  })
})
