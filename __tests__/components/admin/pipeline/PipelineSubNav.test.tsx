import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PipelineSubNav } from '@/components/admin/pipeline/PipelineSubNav'

// next/link renders a plain anchor in jsdom without a router.
afterEach(cleanup)

describe('PipelineSubNav — capacity tab gate', () => {
  it('hides the Capacity tab for a non-qualifying org', () => {
    render(<PipelineSubNav orgSlug="demo" active="opportunities" />)
    expect(screen.queryByRole('link', { name: /Capacity/ })).toBeNull()
  })

  it('shows the Capacity tab when showCapacity is set', () => {
    render(<PipelineSubNav orgSlug="demo" active="opportunities" showCapacity />)
    const link = screen.getByRole('link', { name: /Capacity/ })
    expect(link).toHaveAttribute('href', '/demo/leads/capacity')
  })

  it('always shows the Capacity tab when it is the active page', () => {
    render(<PipelineSubNav orgSlug="demo" active="capacity" />)
    const link = screen.getByRole('link', { name: /Capacity/ })
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})
