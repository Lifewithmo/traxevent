import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CoverSection, SCRIM_CLASS } from '@/components/proposals/sections/CoverSection'

describe('CoverSection', () => {
  it('renders the title', () => {
    render(<CoverSection title="Summer Launch Party" />)
    expect(screen.getByRole('heading', { name: 'Summer Launch Party' })).toBeInTheDocument()
  })

  it('falls back to a generic title', () => {
    render(<CoverSection title="" />)
    expect(screen.getByRole('heading', { name: 'Proposal' })).toBeInTheDocument()
  })

  it('uses a scrim opacity that guarantees AA against any cover image', () => {
    // alpha >= 0.535 guarantees 4.5:1 for white text over pure white.
    const alpha = Number(SCRIM_CLASS.match(/black\/(\d+)/)![1]) / 100
    expect(alpha).toBeGreaterThanOrEqual(0.535)
  })

  it('applies the scrim whenever a cover image is present', () => {
    const { container } = render(
      <CoverSection title="X" branding={{ cover_image_url: 'https://x/i.jpg' }} />,
    )
    expect(container.innerHTML).toContain(SCRIM_CLASS)
  })

  it('shows the client name and event date when supplied', () => {
    render(<CoverSection title="X" clientName="Acme Co" eventDate="Sat 12 Oct" />)
    expect(screen.getByText('Acme Co')).toBeInTheDocument()
    expect(screen.getByText('Sat 12 Oct')).toBeInTheDocument()
  })

  it('renders no logo img when branding has none', () => {
    const { container } = render(<CoverSection title="X" branding={{}} />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('uses the WCAG-derived accent text colour when there is no cover image', () => {
    const { container } = render(<CoverSection title="X" branding={{ accent_color: '#ffe600' }} />)
    expect(container.innerHTML).toContain('--proposal-accent-text')
  })
})
