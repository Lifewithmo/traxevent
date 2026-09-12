import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * The kit's dialog animates a scale + cross-fade on open. Tailwind's
 * `animate-in`/`zoom-in-95` do NOT consult prefers-reduced-motion on their own,
 * so without an explicit `motion-reduce:` escape every dialog in the app — the
 * calendar's ⌘K palette most of all — zooms at a user who asked their OS for
 * no animation. jsdom cannot evaluate a media query on a utility class, so the
 * assertion is on the emitted class list: the guard is either in the string or
 * it is not shipped.
 */
describe('Dialog — prefers-reduced-motion', () => {
  it('guards the popup zoom/fade behind motion-reduce', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Guarded</DialogTitle>
        </DialogContent>
      </Dialog>
    )
    const popup = screen.getByRole('dialog')
    // The animation it has to guard...
    expect(popup.className).toMatch(/zoom-in-95/)
    // ...and the guard itself.
    expect(popup.className).toMatch(/motion-reduce:animate-none/)
  })

  it('guards the backdrop fade behind motion-reduce', () => {
    const { baseElement } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Guarded</DialogTitle>
        </DialogContent>
      </Dialog>
    )
    const overlay = baseElement.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).not.toBeNull()
    expect(overlay!.className).toMatch(/fade-in-0/)
    expect(overlay!.className).toMatch(/motion-reduce:animate-none/)
  })
})
