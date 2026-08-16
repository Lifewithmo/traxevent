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

  // `<a>` excludes interactive descendants, so a row control must never render
  // inside the link. jsdom does not validate the content model, so this is the
  // only guard against the nesting silently coming back.
  it('renders row actions outside the row anchor', () => {
    render(<RelatedRecordCard title="Invoices" count={1}
      rows={[{ id: '1', title: 'Invoice 1001', href: '/o/leads/l/invoices/1', actions: <button type="button">Copy client link</button> }]}
      emptyTitle="No invoices yet" emptyCtaLabel="Create invoice" />)
    const action = screen.getByRole('button', { name: 'Copy client link' })
    expect(action).toBeInTheDocument()
    expect(action.closest('a')).toBeNull()
    // The row is still a link — the action sits beside it, not in place of it.
    expect(screen.getByRole('link', { name: /invoice 1001/i })).toHaveAttribute('href', '/o/leads/l/invoices/1')
  })

  it('leaves a row without actions as a single anchor', () => {
    render(<RelatedRecordCard title="Jobs" count={1}
      rows={[{ id: '1', title: 'Huang Wedding', subtitle: 'Booked', amount: '$5,400', href: '/o/leads/1' }]}
      emptyTitle="No jobs yet" emptyCtaLabel="Book a job" />)
    const link = screen.getByRole('link', { name: /huang wedding/i })
    expect(link).toHaveTextContent('Booked')
    expect(link).toHaveTextContent('$5,400')
  })
})
