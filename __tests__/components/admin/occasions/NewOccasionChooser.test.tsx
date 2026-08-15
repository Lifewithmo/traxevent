import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NewOccasionChooser } from '@/components/admin/occasions/NewOccasionChooser'

describe('NewOccasionChooser', () => {
  it('links the four doors when storefront is enabled', () => {
    render(<NewOccasionChooser orgSlug="acme" storefrontEnabled dropLabel="Drop" />)
    expect(screen.getByRole('link', { name: /client job/i })).toHaveAttribute('href', '/acme/new-event')
    expect(screen.getByRole('link', { name: /market day/i })).toHaveAttribute('href', '/acme/new-market-day')
    expect(screen.getByRole('link', { name: /series/i })).toHaveAttribute('href', '/acme/new-series')
    expect(screen.getByRole('link', { name: /drop/i })).toHaveAttribute('href', '/acme/drops/new')
  })
  it('hides the Drop door without the storefront module', () => {
    render(<NewOccasionChooser orgSlug="acme" storefrontEnabled={false} dropLabel="Drop" />)
    expect(screen.queryByRole('link', { name: /drop/i })).not.toBeInTheDocument()
  })
})
