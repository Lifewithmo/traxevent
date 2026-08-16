import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// The dialog is controlled, so every test needs an owner for `open`. This one
// behaves like a real call site: Cancel, Escape, and confirming all close it.
function Harness({
  onConfirm,
  destructive,
}: {
  onConfirm: () => void
  destructive?: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Void this invoice?"
      description="This cannot be undone."
      confirmLabel="Void invoice"
      onConfirm={onConfirm}
      destructive={destructive}
    />
  )
}

const confirmButton = () => screen.getByRole('button', { name: 'Void invoice' })

describe('ConfirmDialog', () => {
  it('renders the title, the consequence line, and the committed verb', () => {
    render(<Harness onConfirm={vi.fn()} />)
    expect(screen.getByText('Void this invoice?')).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    expect(confirmButton()).toBeInTheDocument()
  })

  // Both dismissal tests assert the dialog actually CLOSED, not just that the
  // verb stayed unrun. `onConfirm` is reachable only from the confirm Button's
  // own onClick, so "not called" is true even if the dismissal is entirely
  // broken — a mutation that disabled Escape, and one that stopped Cancel from
  // closing, both left the suite green. The disappearance of the verb is the
  // part that can fail.
  it('Cancel closes without running the action', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    expect(confirmButton()).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Void invoice' })).toBeNull()
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Escape dismisses without running the action', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    expect(confirmButton()).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Void invoice' })).toBeNull()
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirming runs the action exactly once', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    await user.click(confirmButton())
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  // Regression guard. `window.confirm` blocked the main thread, so a second
  // activation was impossible; `onOpenChange(false)` only *schedules* the close,
  // leaving the button mounted and clickable until the commit lands. Holding
  // Enter (browsers repeat `click` on keydown) or a fast double-click used to
  // fire the irreversible action twice. `open` is pinned here so the button
  // cannot unmount out from under the second activation — exactly the window the
  // real call site has.
  it('rejects a second activation fired inside the same commit window', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete this invoice?"
        confirmLabel="Delete invoice"
        onConfirm={onConfirm}
        destructive
      />,
    )
    const button = screen.getByRole('button', { name: 'Delete invoice' })
    // Two native clicks with no render between them: `disabled` has not been
    // painted yet, so only the synchronous guard can stop the second one.
    act(() => {
      button.click()
      button.click()
    })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // And it stays shut for every activation after the commit, too.
    expect(button).toBeDisabled()
  })

  it('re-arms the confirm button when the dialog is opened again', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    function Reopenable() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Void this invoice?"
            confirmLabel="Void invoice"
            onConfirm={onConfirm}
          />
        </>
      )
    }
    render(<Reopenable />)

    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(confirmButton())
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(confirmButton())
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })

  it('a caller-driven pending state disables the verb without any click', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Void this invoice?"
        confirmLabel="Void invoice"
        busyLabel="Voiding…"
        onConfirm={onConfirm}
        pending
      />,
    )
    const button = screen.getByRole('button', { name: 'Voiding…' })
    expect(button).toBeDisabled()
    act(() => { button.click() })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // `aria-invalid:*-destructive` is in every Button's base class list, so the
  // negative side has to name the variant's own tokens rather than the word.
  it('dresses the committed verb as destructive only when asked', () => {
    const plain = render(<Harness onConfirm={vi.fn()} />)
    expect(plain.container.ownerDocument.body.textContent).toContain('Void invoice')
    expect(confirmButton().className).toContain('bg-primary')
    expect(confirmButton().className).not.toContain('bg-destructive/10')
    plain.unmount()

    render(<Harness onConfirm={vi.fn()} destructive />)
    expect(confirmButton().className).toContain('bg-destructive/10')
    expect(confirmButton().className).toMatch(/(^|\s)text-destructive(\s|$)/)
    expect(confirmButton().className).not.toContain('bg-primary')
  })
})
