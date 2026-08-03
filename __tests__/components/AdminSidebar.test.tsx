import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/auth/establish-session', () => ({ endSession: vi.fn() }))

import { AdminSidebar } from '@/components/layout/AdminSidebar'

describe('AdminSidebar workspace nav gating', () => {
  it('shows every workspace link when enabledModules is omitted', () => {
    render(<AdminSidebar orgSlug="acme" />)
    expect(screen.getByText('Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Registrants')).toBeInTheDocument()
    expect(screen.getByText('Vendors')).toBeInTheDocument()
  })

  it('hides links whose module is not enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads', 'invoices', 'calendar']} />)
    expect(screen.getByText('Pipeline')).toBeInTheDocument()   // leads
    expect(screen.getByText('Invoices')).toBeInTheDocument()   // invoices
    expect(screen.queryByText('Registrants')).not.toBeInTheDocument()
    expect(screen.queryByText('Vendors')).not.toBeInTheDocument()
  })

  it('hides a section header when none of its links are enabled', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    // Insights holds only Reports; with reports disabled the header is gone.
    expect(screen.queryByText('Insights')).not.toBeInTheDocument()
  })

  it('always shows the Settings block regardless of modules', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['leads']} />)
    // Settings panel is collapsed by default on non-settings routes; expand it.
    fireEvent.click(screen.getByText('Settings'))
    expect(screen.getByText('Members')).toBeInTheDocument()
  })
})
