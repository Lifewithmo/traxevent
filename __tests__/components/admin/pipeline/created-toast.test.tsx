import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { CreatedToast, opportunityCreatedMessage } from '@/components/admin/pipeline/CreatedToast'
import type { Lead } from '@/lib/types'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('opportunityCreatedMessage', () => {
  const lead = (over: Partial<Lead>): Lead => ({
    id: 'l1', name: 'Jane Doe', stage: 'inquiry', created_at: 't', updated_at: 't', ...over,
  } as Lead)

  // Spec §6 toast copy: "Opportunity created — {name}{· type}{· Mon D}".
  it('composes name · type · short date when all three are known', () => {
    expect(opportunityCreatedMessage(lead({ event_type: 'Wedding', event_date: '2026-10-04' })))
      .toBe('Opportunity created — Jane Doe · Wedding · Oct 4')
  })

  it('drops the segments the lead does not carry, never printing a dangling separator', () => {
    expect(opportunityCreatedMessage(lead({}))).toBe('Opportunity created — Jane Doe')
    expect(opportunityCreatedMessage(lead({ event_date: '2026-10-04' })))
      .toBe('Opportunity created — Jane Doe · Oct 4')
    expect(opportunityCreatedMessage(lead({ event_type: 'Market' })))
      .toBe('Opportunity created — Jane Doe · Market')
  })
})

describe('CreatedToast', () => {
  it('announces via role="status" and offers the Open link', () => {
    render(
      <CreatedToast
        message="Opportunity created — Jane Doe · Wedding · Oct 4"
        href="/demo/leads/l1"
        onDismiss={() => {}}
      />
    )
    const toast = screen.getByRole('status')
    expect(toast.textContent).toContain('Opportunity created — Jane Doe · Wedding · Oct 4')
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/demo/leads/l1')
  })

  it('renders without an Open link when no href is given (cockpit already shows the job)', () => {
    render(<CreatedToast message="Job created for Tessa Lund" onDismiss={() => {}} />)
    expect(screen.getByRole('status').textContent).toContain('Job created for Tessa Lund')
    expect(screen.queryByRole('link', { name: 'Open' })).toBeNull()
  })

  // WCAG 2.5.8: the dismiss control is a real ≥24px target, not a bare glyph.
  it('offers a labeled dismiss button at a ≥24px target that calls onDismiss', () => {
    const onDismiss = vi.fn()
    render(<CreatedToast message="x" onDismiss={onDismiss} />)
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    // size-6 = 24px square — the kit's minimum target vocabulary.
    expect(dismiss.className).toContain('size-6')
    fireEvent.click(dismiss)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses after 8 seconds, and not a moment before', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<CreatedToast message="x" onDismiss={onDismiss} />)
    act(() => { vi.advanceTimersByTime(7999) })
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('cancels the auto-dismiss timer on unmount instead of calling a stale handler', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const { unmount } = render(<CreatedToast message="x" onDismiss={onDismiss} />)
    unmount()
    act(() => { vi.advanceTimersByTime(10000) })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  // Hard gate: any toast animation is guarded for prefers-reduced-motion.
  it('guards its entrance animation with motion-reduce', () => {
    render(<CreatedToast message="x" onDismiss={() => {}} />)
    const toast = screen.getByRole('status')
    expect(toast.className).toContain('animate-in')
    expect(toast.className).toContain('motion-reduce:animate-none')
  })
})
