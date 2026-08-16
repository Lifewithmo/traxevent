import { describe, it, expect, vi } from 'vitest'
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

  it('renders rows with title, subtitle, badge, and amount', () => {
    render(<RelatedRecordCard title="Jobs" count={1}
      rows={[{
        id: '1', title: 'Huang Wedding', subtitle: 'Booked',
        badge: <span>Confirmed</span>, amount: '$5,400', amountTone: 'money',
      }]}
      emptyTitle="No jobs yet" emptyCtaLabel="Book a job" />)
    expect(screen.getByText('Huang Wedding')).toBeInTheDocument()
    expect(screen.getByText('Booked')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('$5,400')).toBeInTheDocument()
  })

  it('renders a row with an href as a link', () => {
    render(<RelatedRecordCard title="Jobs" count={1}
      rows={[{ id: '1', title: 'Huang Wedding', href: '/o/leads/1' }]}
      emptyTitle="No jobs yet" emptyCtaLabel="Book a job" />)
    expect(screen.getByRole('link', { name: /huang wedding/i })).toHaveAttribute('href', '/o/leads/1')
  })

  it('renders a row without an href as plain text, not a link', () => {
    render(<RelatedRecordCard title="Jobs" count={1}
      rows={[{ id: '1', title: 'Huang Wedding' }]}
      emptyTitle="No jobs yet" emptyCtaLabel="Book a job" />)
    expect(screen.getByText('Huang Wedding')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows the empty state + CTA when there are no rows', () => {
    render(<RelatedRecordCard title="Invoices" count={0} rows={[]}
      emptyTitle="No invoices yet" emptyCtaLabel="Create invoice" onEmptyCta={() => {}} />)
    expect(screen.getByText('No invoices yet')).toBeInTheDocument()
    expect(screen.getByText('Create invoice')).toBeInTheDocument()
  })

  it('fires onEmptyCta when the empty-state CTA is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const onEmptyCta = vi.fn()
    render(<RelatedRecordCard title="Invoices" count={0} rows={[]}
      emptyTitle="No invoices yet" emptyCtaLabel="Create invoice" onEmptyCta={onEmptyCta} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create invoice' }))
    expect(onEmptyCta).toHaveBeenCalledTimes(1)
  })

  // Regression guard: a caller with no action to offer (e.g. VendorDetailSheet
  // passing emptyCtaLabel with no onEmptyCta) must not ship a button that does
  // nothing when clicked. Against the pre-fix component — emptyCtaLabel
  // required, action rendered unconditionally with an unguarded onClick — this
  // assertion fails because the button renders regardless.
  it('renders no CTA button when emptyCtaLabel is passed without onEmptyCta', () => {
    render(<RelatedRecordCard title="Client" count={0} rows={[]}
      emptyTitle="Not linked to a client." emptyCtaLabel="Find a client" />)
    expect(screen.getByText('Not linked to a client.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders no CTA button and still shows emptyTitle when neither CTA prop is passed', () => {
    render(<RelatedRecordCard title="Needs a cost" count={0} rows={[]}
      emptyTitle="Every ingredient is costed" />)
    expect(screen.getByText('Every ingredient is costed')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
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
