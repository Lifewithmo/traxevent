import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import {
  dismissLayerCount,
  useDismissLayer,
  useTopDismissLayer,
} from '@/components/admin/calendar/dismiss-stack'

/**
 * The stack is unit-tested DIRECTLY, and deliberately not only through the
 * cockpit.
 *
 * Through the cockpit, every overlay is a Base UI Dialog, and Base UI 1.5.0
 * already calls `stopPropagation()` on the Escape it consumes. That second
 * guard masks the stack completely: break the stack and the integration test
 * still passes. A test that cannot fail when the thing it names is removed is
 * not a test (see the mutation-test-the-verifier lesson in this repo). These
 * layers close over plain spies, so nothing else can absorb the keypress.
 */

function StackLayer({ active, onDismiss }: { active: boolean; onDismiss: () => void }) {
  useDismissLayer(active, onDismiss)
  return null
}

function SelfClosingLayer({ active }: { active: boolean }) {
  useTopDismissLayer(active)
  return null
}

const escape = () => fireEvent.keyDown(window, { key: 'Escape' })

afterEach(() => {
  cleanup()
  // Every layer is popped by its own effect cleanup; if one leaked, the next
  // test would silently inherit it.
  expect(dismissLayerCount()).toBe(0)
})

describe('dismiss-stack', () => {
  it('dismisses the only open layer', () => {
    const a = vi.fn()
    render(<StackLayer active onDismiss={a} />)
    expect(dismissLayerCount()).toBe(1)
    escape()
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('registers nothing while the layer is inactive, and ignores Escape', () => {
    const a = vi.fn()
    render(<StackLayer active={false} onDismiss={a} />)
    expect(dismissLayerCount()).toBe(0)
    escape()
    expect(a).not.toHaveBeenCalled()
  })

  it('dismisses ONLY the most recently opened layer', () => {
    const under = vi.fn()
    const over = vi.fn()
    render(
      <>
        <StackLayer active onDismiss={under} />
        <StackLayer active onDismiss={over} />
      </>
    )
    escape()
    expect(over).toHaveBeenCalledTimes(1)
    expect(under).not.toHaveBeenCalled()
  })

  it('opening order, not tree order, decides who is on top', () => {
    const first = vi.fn()
    const second = vi.fn()
    // `second` is EARLIER in the tree but opens later — Escape is still its own.
    function Harness({ secondOpen }: { secondOpen: boolean }) {
      return (
        <>
          <StackLayer active={secondOpen} onDismiss={second} />
          <StackLayer active onDismiss={first} />
        </>
      )
    }
    const { rerender } = render(<Harness secondOpen={false} />)
    rerender(<Harness secondOpen />)
    escape()
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('a self-closing layer on top shields everything under it', () => {
    const under = vi.fn()
    function Harness({ overlay }: { overlay: boolean }) {
      return (
        <>
          <StackLayer active onDismiss={under} />
          <SelfClosingLayer active={overlay} />
        </>
      )
    }
    const { rerender } = render(<Harness overlay />)
    escape()
    // The overlay closes itself (Base UI); the stack must not ALSO clear the
    // selection underneath it. This is the ⌘K-over-a-bulk-selection bug.
    expect(under).not.toHaveBeenCalled()

    // …and the moment it closes, Escape belongs to the layer beneath again.
    rerender(<Harness overlay={false} />)
    escape()
    expect(under).toHaveBeenCalledTimes(1)
  })

  it('does not consume an Escape something ahead of it already handled', () => {
    const a = vi.fn()
    render(<StackLayer active onDismiss={a} />)
    // An in-flight reschedule drag cancels on Escape and calls preventDefault.
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(a).not.toHaveBeenCalled()
  })

  it('ignores every key that is not Escape', () => {
    const a = vi.fn()
    render(<StackLayer active onDismiss={a} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Esc' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(a).not.toHaveBeenCalled()
  })

  it('a LOWER layer re-rendering on its own does not promote it to the top', () => {
    // The real shape of this: the agenda re-renders (a row is selected, a bulk
    // move lands) while the peek is open above it. Its `onDismiss` is a fresh
    // closure on every render, so a hook that re-registered on callback
    // identity would pop-and-push the agenda's layer ON TOP of the peek's — and
    // the next Escape would clear the selection instead of closing the peek.
    // Note this only shows up when the LOWER layer alone re-renders: a whole-
    // tree re-render runs every cleanup before every setup, and order survives.
    const under = vi.fn()
    const over = vi.fn()
    function Under() {
      const [n, setN] = useState(0)
      useDismissLayer(true, () => under(n))
      return (
        <button type="button" onClick={() => setN(n + 1)}>
          bump
        </button>
      )
    }
    function Over() {
      useDismissLayer(true, over)
      return null
    }
    const { getByText } = render(
      <>
        <Under />
        <Over />
      </>
    )
    fireEvent.click(getByText('bump'))
    fireEvent.click(getByText('bump'))
    expect(dismissLayerCount()).toBe(2)

    escape()
    expect(over).toHaveBeenCalledTimes(1)
    expect(under).not.toHaveBeenCalled()
  })

  it('always calls the layer’s LATEST callback, not the one it registered with', () => {
    const seen: number[] = []
    function Harness({ n }: { n: number }) {
      useDismissLayer(true, () => seen.push(n))
      return null
    }
    const { rerender } = render(<Harness n={1} />)
    rerender(<Harness n={2} />)
    escape()
    expect(seen).toEqual([2])
  })

  it('unbinds the listener once the last layer closes', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const a = vi.fn()
    const { unmount } = render(<StackLayer active onDismiss={a} />)
    expect(add.mock.calls.filter((c) => c[0] === 'keydown')).toHaveLength(1)
    unmount()
    expect(remove.mock.calls.filter((c) => c[0] === 'keydown')).toHaveLength(1)
    escape()
    expect(a).not.toHaveBeenCalled()
    add.mockRestore()
    remove.mockRestore()
  })
})
