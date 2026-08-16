import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const setLeadWaiting = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/leads', () => ({ setLeadWaiting }))

import { MarkWaitingForm } from '@/components/admin/opportunity/MarkWaitingForm'

beforeEach(() => {
  vi.clearAllMocks()
  setLeadWaiting.mockResolvedValue(undefined)
})

describe('MarkWaitingForm dismissal', () => {
  it('closes on Escape and returns focus to the trigger despite the focused reason input', async () => {
    const user = userEvent.setup()
    render(<MarkWaitingForm orgId="o1" leadId="l1" />)
    const trigger = screen.getByRole('button', { name: 'Mark as waiting' })
    await user.click(trigger)
    expect(screen.getByPlaceholderText('Waiting on…')).toHaveFocus()  // initial focus lands on the reason
    await user.keyboard('{Escape}')
    expect(screen.queryByPlaceholderText('Waiting on…')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on a press outside the panel', async () => {
    const user = userEvent.setup()
    render(<div><MarkWaitingForm orgId="o1" leadId="l1" /><button>outside</button></div>)
    await user.click(screen.getByRole('button', { name: 'Mark as waiting' }))
    // The modal backdrop covers the rest of the page, so it is what an outside
    // press actually lands on.
    fireEvent.click(document.querySelector('[data-slot="dialog-overlay"]')!)
    expect(screen.queryByPlaceholderText('Waiting on…')).not.toBeInTheDocument()
  })
})

describe('MarkWaitingForm', () => {
  function open() {
    fireEvent.click(screen.getByRole('button', { name: 'Mark as waiting' }))
    return screen.getByRole('dialog', { name: 'Mark as waiting' })
  }

  it('requires a reason before saving', () => {
    render(<MarkWaitingForm orgId="o1" leadId="l1" />)
    const dialog = open()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('saves the reason alone, omitting an empty follow-up date', async () => {
    render(<MarkWaitingForm orgId="o1" leadId="l1" />)
    const dialog = open()
    fireEvent.change(within(dialog).getByPlaceholderText('Waiting on…'), { target: { value: 'venue quote' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(setLeadWaiting).toHaveBeenCalledWith('o1', 'l1', { reason: 'venue quote' }))
  })

  it('carries a follow-up date when one is given', async () => {
    render(<MarkWaitingForm orgId="o1" leadId="l1" />)
    const dialog = open()
    fireEvent.change(within(dialog).getByPlaceholderText('Waiting on…'), { target: { value: 'client reviewing' } })
    fireEvent.change(within(dialog).getByLabelText('Follow-up date'), { target: { value: '2026-09-01' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(setLeadWaiting).toHaveBeenCalledWith('o1', 'l1', { reason: 'client reviewing', follow_up_date: '2026-09-01' })
    )
  })
})
