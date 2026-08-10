import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const submitIntakeSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }))
vi.mock('@/actions/intake-public', () => ({ submitIntake: submitIntakeSpy }))

import { IntakeForm } from '@/components/public/IntakeForm'

beforeEach(() => vi.clearAllMocks())

function fillRequired() {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
}

describe('IntakeForm', () => {
  it('submits the payload with token, honeypot, and elapsed time', async () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" />)
    fillRequired()
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Wedding' } })
    fireEvent.change(screen.getByLabelText('Guest count'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }))
    await waitFor(() => expect(submitIntakeSpy).toHaveBeenCalledTimes(1))
    const [token, payload, elapsed] = submitIntakeSpy.mock.calls[0]
    expect(token).toBe('tok_1')
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Ada', email: 'ada@example.com', event_type: 'Wedding',
        guest_count: 120, website: '',
      })
    )
    expect(typeof elapsed).toBe('number')
  })

  it('shows the thank-you panel after success', async () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }))
    expect(await screen.findByText(/Brew Cart Co will get back to you/)).toBeInTheDocument()
  })

  it('renders the action error in the aria-live region', async () => {
    submitIntakeSpy.mockRejectedValueOnce(new Error('Too many requests — please try again later.'))
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }))
    expect(
      await screen.findByText('Too many requests — please try again later.')
    ).toBeInTheDocument()
  })

  it('keeps the submit button disabled until name and email are filled', () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" />)
    expect(screen.getByRole('button', { name: 'Send inquiry' })).toBeDisabled()
    fillRequired()
    expect(screen.getByRole('button', { name: 'Send inquiry' })).toBeEnabled()
  })
})
