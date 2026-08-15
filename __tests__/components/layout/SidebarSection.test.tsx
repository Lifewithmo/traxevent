import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SidebarSection } from '@/components/layout/SidebarSection'

function setup(open = false, onToggle = vi.fn()) {
  render(
    <SidebarSection href="/acme/money" label="Money" icon="invoices" active={false} open={open} onToggle={onToggle}>
      <a href="/acme/invoices">Invoices</a>
    </SidebarSection>,
  )
  return { onToggle }
}

describe('SidebarSection', () => {
  it('renders the label as a link to the section landing page', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Money' })).toHaveAttribute('href', '/acme/money')
  })

  it('renders the chevron as a separate button, not inside the link', () => {
    setup()
    const toggle = screen.getByRole('button', { name: /money/i })
    expect(toggle).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Money' })).not.toContainElement(toggle)
  })

  it('calls onToggle when the chevron is clicked', () => {
    const { onToggle } = setup()
    fireEvent.click(screen.getByRole('button', { name: /money/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('does not call onToggle when the label is clicked', () => {
    const { onToggle } = setup()
    fireEvent.click(screen.getByRole('link', { name: 'Money' }))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('reflects open state via aria-expanded', () => {
    setup(false)
    expect(screen.getByRole('button', { name: /money/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('hides children when closed and shows them when open', () => {
    const { unmount } = render(
      <SidebarSection href="/acme/money" label="Money" icon="invoices" active={false} open={false} onToggle={vi.fn()}>
        <a href="/acme/invoices">Invoices</a>
      </SidebarSection>,
    )
    expect(screen.queryByText('Invoices')).not.toBeInTheDocument()
    unmount()
    render(
      <SidebarSection href="/acme/money" label="Money" icon="invoices" active={false} open onToggle={vi.fn()}>
        <a href="/acme/invoices">Invoices</a>
      </SidebarSection>,
    )
    expect(screen.getByText('Invoices')).toBeInTheDocument()
  })

  it('renders a badge when provided', () => {
    render(
      <SidebarSection href="/acme/money" label="Money" icon="invoices" active={false} open={false} onToggle={vi.fn()} badge="2 late">
        <a href="/acme/invoices">Invoices</a>
      </SidebarSection>,
    )
    expect(screen.getByText('2 late')).toBeInTheDocument()
  })
})
