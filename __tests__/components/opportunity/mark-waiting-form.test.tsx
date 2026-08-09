import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkWaitingForm } from '@/components/admin/opportunity/MarkWaitingForm'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/leads', () => ({ setLeadWaiting: vi.fn() }))

describe('MarkWaitingForm dismissal', () => {
  it('closes on Escape and returns focus to the trigger despite the autoFocus input', async () => {
    const user = userEvent.setup()
    render(<MarkWaitingForm orgId="o1" leadId="l1" />)
    const trigger = screen.getByRole('button', { name: 'Mark as waiting' })
    await user.click(trigger)
    expect(screen.getByPlaceholderText('Waiting on…')).toHaveFocus()  // autoFocus won
    await user.keyboard('{Escape}')
    expect(screen.queryByPlaceholderText('Waiting on…')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
  it('closes on outside pointerdown', async () => {
    const user = userEvent.setup()
    render(<div><MarkWaitingForm orgId="o1" leadId="l1" /><button>outside</button></div>)
    await user.click(screen.getByRole('button', { name: 'Mark as waiting' }))
    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByPlaceholderText('Waiting on…')).not.toBeInTheDocument()
  })
})
