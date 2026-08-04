import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { getEventType } from '@/lib/event-types'

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/camp-2026/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}))

describe('AdminSidebar — terminology-driven labels', () => {
  it('shows "Customers" for event event type', () => {
    const { terminology } = getEventType('event')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Customers')).toBeInTheDocument()
  })

  it('shows "Stations" for catering event type', () => {
    const { terminology } = getEventType('catering')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Stations')).toBeInTheDocument()
  })

  it('shows "Sessions" for photo-shoot event type', () => {
    const { terminology } = getEventType('photo-shoot')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('shows "Deliveries" for floral-event event type', () => {
    const { terminology } = getEventType('floral-event')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Deliveries')).toBeInTheDocument()
  })

  it('always shows Dashboard regardless of event type', () => {
    const { terminology } = getEventType('catering')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('includes a Settings nav link', () => {
    const { terminology } = getEventType('event')
    render(<AdminSidebar orgSlug="acme" eventSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
