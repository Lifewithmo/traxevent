import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CalendarKindFilter } from '@/components/admin/calendar/CalendarKindFilter'

describe('CalendarKindFilter', () => {
  it('links to the unfiltered calendar and the pipeline-only calendar', () => {
    render(<CalendarKindFilter orgSlug="acme" active="all" />)
    expect(screen.getByRole('link', { name: 'Everything' })).toHaveAttribute('href', '/acme/calendar')
    expect(screen.getByRole('link', { name: 'Pipeline only' })).toHaveAttribute('href', '/acme/calendar?kinds=pipeline')
  })

  it('marks the active filter with aria-current', () => {
    render(<CalendarKindFilter orgSlug="acme" active="pipeline" />)
    expect(screen.getByRole('link', { name: 'Pipeline only' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Everything' })).not.toHaveAttribute('aria-current')
  })

  it('preserves the week and view params across a filter change', () => {
    render(<CalendarKindFilter orgSlug="acme" active="all" week="2026-09-07" view="agenda" />)
    expect(screen.getByRole('link', { name: 'Pipeline only' })).toHaveAttribute(
      'href',
      '/acme/calendar?kinds=pipeline&week=2026-09-07&view=agenda',
    )
  })
})
