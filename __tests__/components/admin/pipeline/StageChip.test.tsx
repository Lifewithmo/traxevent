import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { StageChip } from '@/components/admin/pipeline/StageChip'
import type { LeadStage } from '@/lib/types'

// The kit Menu portals its popup to document.body, so every query below goes
// through `screen`, never `container`. And `fireEvent.click` is deliberate:
// `await userEvent.click(trigger)` does NOT open the popup synchronously under
// this repo's vitest/jsdom setup, so switching to userEvent silently breaks
// every assertion that follows.

describe('StageChip', () => {
  it('opens the menu and reports a stage selection', () => {
    const onStage = vi.fn()
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={onStage} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Consultation' }))
    expect(onStage).toHaveBeenCalledWith('consultation')
  })

  it('offers Mark lost as a distinct destructive action', () => {
    const onMarkLost = vi.fn()
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={onMarkLost} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark lost' }))
    expect(onMarkLost).toHaveBeenCalled()
  })

  it('closes the menu after selecting a stage', () => {
    const onStage = vi.fn()
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={onStage} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Consultation' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu after Mark lost', () => {
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark lost' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('sets an aria-label including the stage label and context', () => {
    render(<StageChip stage="proposal" ariaContext="Smith wedding" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Stage: Proposal. Change stage for Smith wedding.' })
    ).toBeInTheDocument()
  })

  // A screen reader needs to be told the popup opened. Base UI 1.5.0 will NOT
  // do it for a `render`ed trigger: MenuTrigger reads its trigger props through
  // an `isMountedByTrigger` selector gated on `activeTriggerId === triggerId`,
  // which never matches, so the trigger stays at aria-expanded="false" forever
  // even while `data-popup-open` is set and role=menu is in the document. The
  // chip owns `open` and writes the attribute by hand — assert the whole cycle,
  // because the attribute merely EXISTING is what made the bug invisible.
  it('reports the popup state on the trigger', () => {
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /Stage: Inquiry/ })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { expanded: true })).toBe(trigger)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Consultation' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders menu items for open stages plus closed_won and a destructive Mark lost', () => {
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    const menu = screen.getByRole('menu')
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(items).toEqual(['Inquiry', 'Consultation', 'Proposal', 'Closed Won', 'Mark lost'])
    expect(menu).toBeInTheDocument()
  })

  it('closes on an outside pointerdown', () => {
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // NOTE ON PAGE SCROLL. There is deliberately no `fireEvent.scroll(document)`
  // test here. floating-ui's `autoUpdate` re-anchors on page scroll, but
  // `ancestorScroll` binds to REAL scroll ancestors and jsdom has no layout, so
  // such a test exercises nothing and passes for any implementation — including
  // one that strands a detached popup. Page-scroll re-anchoring is only
  // observable in a browser. What IS testable, and is the case that actually
  // breaks, is the clipping scroller below.

  // The popup is portalled to document.body, so the board column
  // (`overflow-y-auto`, capped height) does NOT clip it. Re-anchoring alone is
  // therefore not enough: scroll the column past the open card and the menu
  // would float over the column header, anchored to a row that has gone. The
  // chip closes itself from its own clipping scrollers.
  it('closes when a scrollable ancestor scrolls the trigger away', () => {
    render(
      <div data-testid="column" style={{ overflowY: 'auto' }}>
        <StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.scroll(screen.getByTestId('column'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('ignores scroll from a non-scrollable ancestor', () => {
    render(
      <div data-testid="plain">
        <StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.scroll(screen.getByTestId('plain'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('does not close on a pointerdown inside the menu', () => {
    render(<StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Consultation' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  // DELIBERATE BEHAVIOUR CHANGE, pinned so it cannot drift again: the kit Menu
  // wires its trigger with `useClick(..., { event: 'mousedown' })`, so the chip
  // now opens on MOUSEDOWN where the old hand-rolled one opened on click. The
  // handler runs inside a rAF, which is why a synchronous probe misses it.
  describe('press and drag on the board', () => {
    function renderInCard() {
      return render(
        <article draggable data-testid="card">
          <StageChip stage="inquiry" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />
        </article>
      )
    }

    const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

    it('opens on mousedown, not only on click', async () => {
      renderInCard()
      fireEvent.mouseDown(screen.getByRole('button', { name: /Stage: Inquiry/ }))
      await settle()
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    // The board makes every card a `draggable` article with the chip inside it
    // (PipelineBoardView), so a press-and-drag STARTED ON THE CHIP now pops the
    // menu on the same frame the drag begins — the click-driven chip never did,
    // because a click never fires after a drag.
    it('dismisses the menu once the card actually starts dragging', async () => {
      renderInCard()
      const trigger = screen.getByRole('button', { name: /Stage: Inquiry/ })
      fireEvent.mouseDown(trigger)
      await settle()
      expect(screen.getByRole('menu')).toBeInTheDocument()

      fireEvent.dragStart(screen.getByTestId('card'))
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })

    it('refuses to re-open while the drag is still in flight', async () => {
      renderInCard()
      fireEvent.dragStart(screen.getByTestId('card'))
      fireEvent.mouseDown(screen.getByRole('button', { name: /Stage: Inquiry/ }))
      await settle()
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('opens again once the drag ends', async () => {
      renderInCard()
      fireEvent.dragStart(screen.getByTestId('card'))
      fireEvent.dragEnd(screen.getByTestId('card'))
      fireEvent.mouseDown(screen.getByRole('button', { name: /Stage: Inquiry/ }))
      await settle()
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
  })

  describe('stage tone', () => {
    // A per-state tone is the whole point: one gray badge for five stages tells
    // the operator nothing. Each stage must resolve through STAGE_TONE to a
    // distinct kit token pair.
    const cases: Array<[LeadStage, string]> = [
      ['inquiry', '--status-neutral-bg'],
      ['consultation', '--status-pending-bg'],
      ['proposal', '--status-pending-bg'],
      ['closed_won', '--status-confirmed-bg'],
      ['closed_lost', '--status-alert-bg'],
    ]

    it.each(cases)('paints %s with %s', (stage, token) => {
      const { container } = render(
        <StageChip stage={stage} ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />
      )
      const pill = container.querySelector('[data-slot="status-pill"]')
      expect(pill).not.toBeNull()
      expect(pill!.className).toContain(`bg-[var(${token})]`)
    })

    it('gives closed_won and closed_lost different tones', () => {
      const won = render(
        <StageChip stage="closed_won" ariaContext="A" onStage={vi.fn()} onMarkLost={vi.fn()} />
      ).container.querySelector('[data-slot="status-pill"]')!.className
      const lost = render(
        <StageChip stage="closed_lost" ariaContext="B" onStage={vi.fn()} onMarkLost={vi.fn()} />
      ).container.querySelector('[data-slot="status-pill"]')!.className
      expect(won).not.toEqual(lost)
    })

    it('uses no raw Tailwind colour literal anywhere in the chip', () => {
      const { container } = render(
        <StageChip stage="closed_lost" ariaContext="Test opp" onStage={vi.fn()} onMarkLost={vi.fn()} />
      )
      fireEvent.click(screen.getByRole('button', { name: /Stage: Closed Lost/ }))
      const classNames = [
        ...Array.from(container.querySelectorAll('[class]')),
        ...Array.from(document.body.querySelectorAll('[data-slot="menu-content"] [class], [data-slot="menu-content"]')),
      ]
        .map((el) => el.getAttribute('class') ?? '')
        .join(' ')
      expect(classNames).not.toMatch(
        /\b(?:bg|text|border|ring|fill|stroke)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
      )
      expect(classNames).not.toMatch(/\bbg-white\b|\bbg-black\b|\btext-white\b|\btext-black\b/)
    })
  })
})
