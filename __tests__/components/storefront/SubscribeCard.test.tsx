import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const subscribeSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }))
vi.mock('@/actions/storefront-public', () => ({ subscribeToDrops: subscribeSpy }))

import { SubscribeCard } from '@/components/storefront/SubscribeCard'

describe('SubscribeCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits handle + email + elapsed time and shows the success state', async () => {
    render(<SubscribeCard handle="lovebrew" />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'fan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /don't miss the next one/i }))
    await waitFor(() => expect(screen.getByText(/you're on the list/i)).toBeInTheDocument())
    const [handle, input, elapsed] = subscribeSpy.mock.calls[0]
    expect(handle).toBe('lovebrew')
    expect(input.email).toBe('fan@example.com')
    expect(typeof elapsed).toBe('number')
  })

  it('renders a hidden website honeypot field', () => {
    const { container } = render(<SubscribeCard handle="lovebrew" />)
    expect(container.querySelector('input[name="website"]')).toBeInTheDocument()
  })

  it('surfaces server errors', async () => {
    subscribeSpy.mockRejectedValue(new Error('Too many requests — please try again later.'))
    render(<SubscribeCard handle="lovebrew" />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'fan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /don't miss the next one/i }))
    await waitFor(() => expect(screen.getByText(/too many requests/i)).toBeInTheDocument())
  })
})
