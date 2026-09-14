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

// Event types inc 1 (spec §5c): with ≥1 active org type, the free-text input
// is replaced by a select of names + "Something else"; with 0 it is
// untouched. Either way `submitIntake` still only ever receives the plain
// string — the org resolves `event_type_id` server-side (actions/intake-public.ts).
describe('IntakeForm — event type select (event types inc 1)', () => {
  it('renders a plain input, unchanged, when the org has no active types', () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" activeEventTypeNames={[]} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    const input = screen.getByLabelText('Event type')
    fireEvent.change(input, { target: { value: 'Wedding' } })
    expect(input).toHaveValue('Wedding')
  })

  it('lists the active type names plus "Something else"', () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" activeEventTypeNames={['Wedding', 'Corporate']} />)
    const select = screen.getByLabelText('Event type') as HTMLSelectElement
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels).toEqual(expect.arrayContaining(['Wedding', 'Corporate', 'Something else…']))
    expect(screen.queryByRole('textbox', { name: /event type/i })).toBeNull()
  })

  it('"Something else…" reveals the free-text input, and a listed pick submits that string', async () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" activeEventTypeNames={['Wedding', 'Corporate']} />)
    fillRequired()
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'Wedding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }))
    await waitFor(() => expect(submitIntakeSpy).toHaveBeenCalledTimes(1))
    expect(submitIntakeSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({ event_type: 'Wedding' })
    )
  })

  it('submits the typed string when "Something else…" is chosen', async () => {
    render(<IntakeForm token="tok_1" orgName="Brew Cart Co" activeEventTypeNames={['Wedding', 'Corporate']} />)
    fillRequired()
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '__other__' } })
    fireEvent.change(screen.getByLabelText('Tell us more'), { target: { value: 'Bar mitzvah' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send inquiry' }))
    await waitFor(() => expect(submitIntakeSpy).toHaveBeenCalledTimes(1))
    expect(submitIntakeSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({ event_type: 'Bar mitzvah' })
    )
  })
})
