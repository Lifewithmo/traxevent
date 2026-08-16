import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from '@/components/ui/status-pill'

describe('StatusPill', () => {
  it('renders its label', () => {
    render(<StatusPill tone="alert">Past-due</StatusPill>)
    expect(screen.getByText('Past-due')).toBeInTheDocument()
  })
  it('uses the confirmed status token, not a raw palette class', () => {
    render(<StatusPill tone="confirmed">Active</StatusPill>)
    const el = screen.getByText('Active')
    expect(el.className).toContain('var(--status-confirmed-bg)')
    expect(el.className).not.toContain('green-100')
  })
})
