import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const { ensureSpy, regenSpy } = vi.hoisted(() => ({
  ensureSpy: vi.fn().mockResolvedValue('tok_aaa'),
  regenSpy: vi.fn().mockResolvedValue('tok_bbb'),
}))
vi.mock('@/actions/intake', () => ({
  ensureIntakeToken: ensureSpy,
  regenerateIntakeToken: regenSpy,
}))

import { IntakeLinkCard } from '@/components/admin/pipeline/IntakeLinkCard'

beforeEach(() => vi.clearAllMocks())

describe('IntakeLinkCard', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<IntakeLinkCard orgId="o1" open={false} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    expect(ensureSpy).not.toHaveBeenCalled()
  })

  it('mints (or fetches) the token on open and shows the URL', async () => {
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    expect(await screen.findByText(/\/inquire\/tok_aaa/)).toBeInTheDocument()
    expect(ensureSpy).toHaveBeenCalledWith('o1')
  })

  it('regenerate requires a confirm, then swaps the URL', async () => {
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    await screen.findByText(/tok_aaa/)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(regenSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/current link will stop working/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, regenerate' }))
    expect(await screen.findByText(/\/inquire\/tok_bbb/)).toBeInTheDocument()
    expect(regenSpy).toHaveBeenCalledWith('o1')
  })

  // The error used to render ONLY in the outer dialog, which the confirm popup
  // covers with its own `fixed inset-0` backdrop and stamps `aria-hidden`/`inert`
  // (FloatingFocusManager -> markOthers). `setConfirming(false)` sat inside the
  // try after `setToken`, so a failure left the operator staring at the confirm
  // dialog with no visible and no announced failure at all.
  it('reports a failed regenerate inside the confirm dialog the operator is looking at', async () => {
    regenSpy.mockRejectedValueOnce(new Error('Rate limited — try again in a minute'))
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    await screen.findByText(/tok_aaa/)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    const confirm = screen.getByText(/current link will stop working/i).closest(
      '[data-slot="dialog-content"]'
    ) as HTMLElement
    fireEvent.click(screen.getByRole('button', { name: 'Yes, regenerate' }))

    // Not merely present somewhere in the document — present in the popup that
    // is actually on top, inside a live region, and not aria-hidden.
    const message = await within(confirm).findByText(/rate limited/i)
    expect(message.closest('[aria-live]')).not.toBeNull()
    expect(message.closest('[aria-hidden="true"]')).toBeNull()
    expect(confirm.closest('[aria-hidden="true"]')).toBeNull()
    // …and the operator is still on the confirm step, able to retry.
    expect(screen.getByRole('button', { name: 'Yes, regenerate' })).toBeEnabled()
  })

  // Two sibling <Dialog> roots never register with each other (Base UI links
  // dialogs through React context only), so both stayed `isTopmost` and both
  // registered a document keydown listener — one Escape closed both.
  it('closes only the confirm dialog on Escape, leaving the intake dialog up', async () => {
    const onClose = vi.fn()
    render(<IntakeLinkCard orgId="o1" open onClose={onClose} />)
    await screen.findByText(/tok_aaa/)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(screen.getByText(/current link will stop working/i)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    await vi.waitFor(() =>
      expect(screen.queryByText(/current link will stop working/i)).not.toBeInTheDocument()
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(/\/inquire\/tok_aaa/)).toBeInTheDocument()
  })

  it('copies the URL to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<IntakeLinkCard orgId="o1" open onClose={() => {}} />)
    await screen.findByText(/tok_aaa/)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/inquire/tok_aaa'))
  })
})
