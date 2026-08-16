import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelatedRecordCard } from '@/components/ui/related-record-card'

describe('RelatedRecordCard', () => {
  it('shows the count in the title and previews rows', () => {
    render(<RelatedRecordCard title="Proposals" count={2}
      rows={[{ id: '1', title: 'Huang Wedding', amount: '$5,400', amountTone: 'money' }]}
      emptyTitle="No proposals yet" emptyCtaLabel="Draft one" />)
    expect(screen.getByText('Proposals')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Huang Wedding')).toBeInTheDocument()
  })
  it('shows the empty state + CTA when there are no rows', () => {
    render(<RelatedRecordCard title="Invoices" count={0} rows={[]} emptyTitle="No invoices yet" emptyCtaLabel="Create invoice" />)
    expect(screen.getByText('No invoices yet')).toBeInTheDocument()
    expect(screen.getByText('Create invoice')).toBeInTheDocument()
  })
})
