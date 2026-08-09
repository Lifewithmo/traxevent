import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SubscribePanel } from '@/components/admin/calendar/SubscribePanel'

const URL_BASE = 'https://app.example/ics/acme/tok123'
const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  writeText.mockClear()
  Object.assign(navigator, { clipboard: { writeText } })
})

describe('SubscribePanel', () => {
  it('shows the bare feed URL when every kind is included', () => {
    render(<SubscribePanel url={URL_BASE} />)
    expect(screen.getByText(URL_BASE)).toBeInTheDocument()
  })

  it('unchecking a kind produces a filtered feed URL — money can stay off a shared calendar', () => {
    render(<SubscribePanel url={URL_BASE} />)
    fireEvent.click(screen.getByLabelText('Invoice due'))
    expect(screen.getByText(`${URL_BASE}?include=event,lead,task,follow_up,compliance`)).toBeInTheDocument()
  })

  it('copies the current URL', async () => {
    render(<SubscribePanel url={URL_BASE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_BASE))
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('account connections are drawn but disabled', () => {
    render(<SubscribePanel url={URL_BASE} />)
    const connects = screen.getAllByRole('button', { name: 'Connect' })
    expect(connects).toHaveLength(2)
    connects.forEach((b) => expect(b).toBeDisabled())
  })
})
