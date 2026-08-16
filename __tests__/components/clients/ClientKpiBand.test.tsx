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
})
