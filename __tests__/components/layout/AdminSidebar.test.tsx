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
  it('shows "Families" for summer-camp event type', () => {
    const { terminology } = getEventType('summer-camp')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Families')).toBeInTheDocument()
  })

  it('shows "Guests" for gala event type', () => {
    const { terminology } = getEventType('gala')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Guests')).toBeInTheDocument()
  })

  it('shows "Children" for vbs event type', () => {
    const { terminology } = getEventType('vbs')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Children')).toBeInTheDocument()
  })

  it('shows "Participants" for mission-trip event type', () => {
    const { terminology } = getEventType('mission-trip')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Participants')).toBeInTheDocument()
  })

  it('always shows Dashboard regardless of event type', () => {
    const { terminology } = getEventType('gala')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('includes a Settings nav link', () => {
    const { terminology } = getEventType('summer-camp')
    render(<AdminSidebar orgSlug="acme" campSlug="camp-2026" terminology={terminology} />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
