import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The panel imports @/actions/calendar-sync lazily (its graph reaches
// firebase-admin), so the mock has to be in place before the dynamic import
// resolves — vi.mock is hoisted, which covers that.
const { canRotateSpy, rotateSpy } = vi.hoisted(() => ({
  canRotateSpy: vi.fn().mockResolvedValue(false),
  rotateSpy: vi.fn().mockResolvedValue('tok_new'),
}))
vi.mock('@/actions/calendar-sync', () => ({
  canRotateIcsToken: canRotateSpy,
  rotateIcsToken: rotateSpy,
}))

import { SubscribePanel } from '@/components/admin/calendar/SubscribePanel'

const URL_BASE = 'https://app.example/ics/acme/tok123'
const writeText = vi.fn().mockResolvedValue(undefined)

const ALL_KINDS = ['Booked event', 'Opportunity date', 'Task', 'Follow-up', 'Compliance', 'Invoice due', 'Drop pickup']

/** Uncheck every kind — the state the old code turned into `?include=`. */
function uncheckEverything() {
  for (const label of ALL_KINDS) fireEvent.click(screen.getByLabelText(label))
}

beforeEach(() => {
  vi.clearAllMocks()
  canRotateSpy.mockResolvedValue(false)
  rotateSpy.mockResolvedValue('tok_new')
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
    expect(screen.getByText(`${URL_BASE}?include=event,lead,task,follow_up,compliance,drop`)).toBeInTheDocument()
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

  // The footgun at source. With zero kinds checked the panel used to render
  // `…?include=`, a URL the route read as "no filter" and answered with EVERY
  // kind — invoice balances included. The URL must never be offered at all.
  describe('with nothing checked', () => {
    it('offers no URL to copy and disables Copy', () => {
      const { container } = render(<SubscribePanel url={URL_BASE} />)
      uncheckEverything()
      // the dangerous artifact is not merely uncopyable — it is not rendered at all,
      // so it cannot be hand-selected out of the page either
      expect(container.textContent).not.toContain('?include=')
      expect(container.textContent).not.toContain(URL_BASE)
      expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
      expect(screen.getByText(/Nothing selected/i)).toBeInTheDocument()
    })

    it('says why, at the checkboxes where the operator just clicked', () => {
      render(<SubscribePanel url={URL_BASE} />)
      uncheckEverything()
      expect(screen.getByRole('alert')).toHaveTextContent(/Pick at least one/i)
    })

    // The disabled attribute is the mechanism — copy()'s own guard sits behind it
    // and cannot be reached through the DOM, so this asserts the reachable half.
    it('the disabled Copy button is what keeps the empty-filter URL off the clipboard', async () => {
      render(<SubscribePanel url={URL_BASE} />)
      uncheckEverything()
      const copyBtn = screen.getByRole('button', { name: 'Copy' })
      expect(copyBtn).toBeDisabled()
      fireEvent.click(copyBtn)
      await Promise.resolve()
      expect(writeText).not.toHaveBeenCalled()
    })

    it('recovers the moment a kind is re-checked', () => {
      render(<SubscribePanel url={URL_BASE} />)
      uncheckEverything()
      fireEvent.click(screen.getByLabelText('Booked event'))
      expect(screen.getByText(`${URL_BASE}?include=event`)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Copy' })).not.toBeDisabled()
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  it('warns that the link needs no login — it is a key, not a page', async () => {
    render(<SubscribePanel url={URL_BASE} />)
    expect(screen.getByText(/read the feed without logging in/i)).toBeInTheDocument()
  })

  describe('regenerate feed URL', () => {
    it('is NOT rendered for a non-admin', async () => {
      canRotateSpy.mockResolvedValue(false)
      render(<SubscribePanel url={URL_BASE} />)
      await waitFor(() => expect(canRotateSpy).toHaveBeenCalledWith('acme'))
      expect(screen.queryByRole('button', { name: /regenerate/i })).toBeNull()
    })

    it('is NOT rendered when the permission probe fails outright', async () => {
      canRotateSpy.mockRejectedValue(new Error('Unauthorized'))
      render(<SubscribePanel url={URL_BASE} />)
      await waitFor(() => expect(canRotateSpy).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /regenerate/i })).toBeNull()
    })

    it('is rendered for an admin, and confirms before firing — naming the consequence', async () => {
      canRotateSpy.mockResolvedValue(true)
      render(<SubscribePanel url={URL_BASE} />)
      const trigger = await screen.findByRole('button', { name: 'Regenerate feed URL' })

      fireEvent.click(trigger)
      expect(rotateSpy).not.toHaveBeenCalled()
      expect(screen.getByText(/Every existing subscription breaks, for everyone/i)).toBeInTheDocument()
    })

    it('confirming rotates the token and shows the URL that now works', async () => {
      canRotateSpy.mockResolvedValue(true)
      render(<SubscribePanel url={URL_BASE} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Regenerate feed URL' }))
      fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

      expect(await screen.findByText('https://app.example/ics/acme/tok_new')).toBeInTheDocument()
      expect(rotateSpy).toHaveBeenCalledWith('acme')
      expect(screen.queryByText(URL_BASE)).toBeNull()
    })

    it('cancelling leaves the old URL alone', async () => {
      canRotateSpy.mockResolvedValue(true)
      render(<SubscribePanel url={URL_BASE} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Regenerate feed URL' }))
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull())
      expect(rotateSpy).not.toHaveBeenCalled()
      expect(screen.getByText(URL_BASE)).toBeInTheDocument()
    })

    it('reports a failed rotation instead of silently keeping a dead URL', async () => {
      canRotateSpy.mockResolvedValue(true)
      rotateSpy.mockRejectedValue(new Error('Forbidden'))
      render(<SubscribePanel url={URL_BASE} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Regenerate feed URL' }))
      fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

      expect(await screen.findByText('Forbidden')).toBeInTheDocument()
      expect(screen.getByText(URL_BASE)).toBeInTheDocument()
    })
  })
})
