import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act, createEvent } from '@testing-library/react'
import { PipelineBoardView } from '@/components/admin/pipeline/PipelineBoardView'
import type { PipelineGroups } from '@/lib/pipeline-view'
import type { Lead } from '@/lib/types'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
const setLeadStage = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ setLeadStage: (...args: unknown[]) => setLeadStage(...args), createLead: vi.fn() }))
vi.mock('@/actions/intake', () => ({
  ensureIntakeToken: vi.fn().mockResolvedValue('tok123'),
  regenerateIntakeToken: vi.fn().mockResolvedValue('tok456'),
}))

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Halcyon Studios', stage: 'inquiry', created_at: 't', updated_at: 't', ...over,
} as Lead)

const baseProps = {
  orgId: 'o1', orgSlug: 'demo',
  groups: {
    needs_attention: [],
    waiting: [],
    active: [{ lead: lead({ estimated_value: 1200 }), health: 'active' as const, statusLine: 'Waiting on reply' }],
  },
  monthly: { wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0 },
}

const column = (stage: string) =>
  document.querySelector(`[data-stage-column="${stage}"]`) as HTMLElement
const dropzone = (stage: string) =>
  document.querySelector(`[data-stage-dropzone="${stage}"]`) as HTMLElement
/** The stage a card currently sits in — not `textContent`, which an empty
 *  column's "Move <title> here" CTA would also match. */
const stageOf = (cardLabel: RegExp) =>
  screen.getByRole('article', { name: cardLabel })
    .closest('[data-stage-column]')!
    .getAttribute('data-stage-column')

/**
 * jsdom implements neither `DragEvent` nor `DataTransfer`. testing-library's
 * `createEvent` handles exactly this: it falls back to `Event` and copies a
 * supplied `dataTransfer` onto the instance, so a plain object with the two
 * methods the board calls is a faithful stand-in for the drag data store.
 */
function dataTransfer() {
  const store = new Map<string, string>()
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
    setData: (type: string, value: string) => { store.set(type, value) },
    getData: (type: string) => store.get(type) ?? '',
  }
}

/**
 * A `dragleave` that reports WHERE the pointer went. jsdom implements neither
 * DragEvent nor its MouseEvent `relatedTarget` init, so `fireEvent.dragLeave(el,
 * { relatedTarget })` silently drops the field and every leave looks like a
 * leave to nowhere — which is exactly the bug this pins. Defining the property
 * on a real event object is the one form that survives the fallback.
 */
function dragLeaveTowards(target: HTMLElement, relatedTarget: Node | null) {
  const event = createEvent.dragLeave(target, { dataTransfer: dataTransfer() })
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget, configurable: true })
  fireEvent(target, event)
}

describe('PipelineBoardView', () => {
  beforeEach(() => {
    setLeadStage.mockClear().mockResolvedValue(undefined)
    push.mockClear()
    refresh.mockClear()
    const slot = document.createElement('div')
    slot.id = 'tx-pipeline-actions'
    document.body.appendChild(slot)
  })

  afterEach(() => {
    cleanup()
    document.getElementById('tx-pipeline-actions')?.remove()
  })

  it('moves a card stage with arrow keys', async () => {
    render(<PipelineBoardView {...baseProps} />)
    const card = screen.getByRole('article', { name: /Halcyon Studios/ })
    card.focus()
    fireEvent.keyDown(card, { key: 'ArrowRight' })
    expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'consultation')
  })

  it('does not move stage when arrow keys fire from a focused descendant', () => {
    render(<PipelineBoardView {...baseProps} />)
    const trigger = screen.getByRole('button', { name: /Stage: Inquiry/ })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowRight' })
    expect(setLeadStage).not.toHaveBeenCalled()
  })

  it('promotes the column rollup to a figure: count as prose, value in the money token', () => {
    render(<PipelineBoardView {...baseProps} />)
    const inquiry = column('inquiry')
    expect(inquiry.textContent).toContain('1 deal')
    const moneyEl = Array.from(inquiry.querySelectorAll('p')).find((p) => p.textContent === '$1,200')
    expect(moneyEl).toBeTruthy()
    expect(moneyEl!.className).toContain('var(--money-green)')
    expect(moneyEl!.className).toContain('tabular-nums')
    // Plural/singular is part of the design, not polish.
    expect(column('consultation').textContent).toContain('0 deals')
  })

  it('routes Mark lost to the opportunity page', () => {
    render(<PipelineBoardView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark lost' }))
    expect(push).toHaveBeenCalledWith('/demo/leads/l1?focus=lost')
  })

  // R8 — the single hardest blocker on this surface: an inline
  // `gridTemplateColumns` cannot be overridden by any media query, so the board
  // was three ~100px columns on a phone.
  it('collapses the board to one column below md with no inline grid template', () => {
    const { container } = render(<PipelineBoardView {...baseProps} />)
    const grid = container.querySelector('.grid') as HTMLElement
    expect(grid.className).toContain('grid-cols-3')
    expect(grid.className).toContain('max-md:grid-cols-1')
    expect(grid.style.gridTemplateColumns).toBe('')
  })

  describe('drag and drop', () => {
    it('carries the lead id and the move effect on dragstart, and highlights the hovered column', () => {
      render(<PipelineBoardView {...baseProps} />)
      const card = screen.getByRole('article', { name: /Halcyon Studios/ })
      const dt = dataTransfer()

      fireEvent.dragStart(card, { dataTransfer: dt })
      expect(dt.getData('text/plain')).toBe('l1')
      // Undeclared, the browser is free to show a copy cursor for a move.
      expect(dt.effectAllowed).toBe('move')

      const target = dropzone('proposal')
      expect(target.style.background).toBe('')
      fireEvent.dragOver(target, { dataTransfer: dt })
      expect(target.style.background).toContain('var(--muted)')
      expect(dt.dropEffect).toBe('move')
      dragLeaveTowards(target, null)
      expect(target.style.background).toBe('')
    })

    /*
      `dragleave` fires at the element being LEFT on every internal boundary
      crossing — dropzone→card, card→card — and bubbles to the dropzone's
      handler. Clearing unconditionally made the one signal that says "this
      column will take the drop" strobe its way across a populated column: leave
      clears, the next dragover sets it again, at every card edge.
    */
    it('keeps the drop highlight lit while the drag crosses cards inside the column', () => {
      render(<PipelineBoardView {...baseProps} />)
      const dt = dataTransfer()
      const target = dropzone('inquiry')
      const cardInside = screen.getByRole('article', { name: /Halcyon Studios/ })
      expect(target.contains(cardInside)).toBe(true)

      fireEvent.dragOver(target, { dataTransfer: dt })
      expect(target.style.background).toContain('var(--muted)')

      // Pointer moved from the dropzone onto a card that is still inside it.
      dragLeaveTowards(target, cardInside)
      expect(target.style.background).toContain('var(--muted)')

      // Leaving for good — a target outside the column — still clears it.
      dragLeaveTowards(target, dropzone('proposal'))
      expect(target.style.background).toBe('')
    })

    it('drops onto a column: optimistic move first, server call second, highlight cleared', async () => {
      let settle: () => void = () => {}
      setLeadStage.mockImplementation(() => new Promise<void>((res) => { settle = () => res() }))

      render(<PipelineBoardView {...baseProps} />)
      const card = screen.getByRole('article', { name: /Halcyon Studios/ })
      const dt = dataTransfer()
      fireEvent.dragStart(card, { dataTransfer: dt })
      const target = dropzone('proposal')
      fireEvent.dragOver(target, { dataTransfer: dt })
      fireEvent.drop(target, { dataTransfer: dt })

      expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'proposal')
      // Optimistic: the card is in Proposal BEFORE the action resolves, and the
      // column rollup moved with it.
      expect(stageOf(/Halcyon Studios/)).toBe('proposal')
      expect(column('proposal').textContent).toContain('$1,200')
      expect(column('inquiry').textContent).toContain('$0')
      expect(target.style.background).toBe('')

      await act(async () => { settle() })
      expect(refresh).toHaveBeenCalled()
      expect(push).not.toHaveBeenCalled()
    })

    it('rolls the card back and reports the failure when the server rejects the drop', async () => {
      setLeadStage.mockRejectedValue(new Error('Permission denied'))

      render(<PipelineBoardView {...baseProps} />)
      const card = screen.getByRole('article', { name: /Halcyon Studios/ })
      const dt = dataTransfer()
      fireEvent.dragStart(card, { dataTransfer: dt })
      fireEvent.drop(dropzone('consultation'), { dataTransfer: dt })

      await waitFor(() => expect(screen.getByText('Permission denied')).toBeInTheDocument())
      expect(stageOf(/Halcyon Studios/)).toBe('inquiry')
      expect(column('consultation').textContent).toContain('Nothing in Consultation')
      expect(refresh).not.toHaveBeenCalled()
    })

    it('drops to Closed Won by removing the card and routing to convert', async () => {
      render(<PipelineBoardView {...baseProps} />)
      // Closed Won is not a column, so the chip is the only route to it — and
      // the chip refuses to open mid-drag, so this must not follow a dragStart.
      fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Closed Won' }))
      await waitFor(() => expect(push).toHaveBeenCalledWith('/demo/leads/l1?convert=1'))
      expect(screen.queryByRole('article', { name: /Halcyon Studios/ })).toBeNull()
      expect(refresh).not.toHaveBeenCalled()
    })

    /*
      CONCURRENCY. Two overlapping drags, entirely inside normal board use:
      card A resolves and fires router.refresh(); during that RSC round trip
      (300ms–1.5s here — the same request also writes an activity log) the
      operator drags card B; then A's payload lands, computed BEFORE B moved.
      The props→state sync replaces the whole array with it, so B snaps back to
      Inquiry while B's own write is still in flight, then teleports forward
      again when B's refresh lands. Every in-flight move must be re-applied on
      top of the server payload.
    */
    it('keeps an in-flight optimistic move when another card\'s refresh payload lands', async () => {
      const settle: Record<string, () => void> = {}
      setLeadStage.mockImplementation((_org: string, id: string) =>
        new Promise<void>((res) => { settle[id] = () => res() }))

      const twoInInquiry: PipelineGroups = {
        needs_attention: [], waiting: [],
        active: [
          { lead: lead({ id: 'A', name: 'Alder Co', estimated_value: 100 }), health: 'active', statusLine: 'A line' },
          { lead: lead({ id: 'B', name: 'Birch Co', estimated_value: 200 }), health: 'active', statusLine: 'B line' },
        ],
      }
      const { rerender } = render(<PipelineBoardView {...baseProps} groups={twoInInquiry} />)

      // (1) A: Inquiry → Consultation, resolves, fires its refresh.
      const dtA = dataTransfer()
      fireEvent.dragStart(screen.getByRole('article', { name: /Alder Co/ }), { dataTransfer: dtA })
      fireEvent.drop(dropzone('consultation'), { dataTransfer: dtA })
      await act(async () => { settle.A() })
      expect(refresh).toHaveBeenCalled()

      // (2) Mid round trip, B: Inquiry → Proposal. Its write does NOT resolve.
      const dtB = dataTransfer()
      fireEvent.dragStart(screen.getByRole('article', { name: /Birch Co/ }), { dataTransfer: dtB })
      fireEvent.drop(dropzone('proposal'), { dataTransfer: dtB })
      expect(stageOf(/Birch Co/)).toBe('proposal')

      // (3) A's payload arrives — A moved, B still where the server last saw it.
      const aRefreshPayload: PipelineGroups = {
        needs_attention: [], waiting: [],
        active: [
          { lead: lead({ id: 'A', name: 'Alder Co', stage: 'consultation', estimated_value: 100 }), health: 'active', statusLine: 'A reconciled' },
          { lead: lead({ id: 'B', name: 'Birch Co', estimated_value: 200 }), health: 'active', statusLine: 'B line' },
        ],
      }
      rerender(<PipelineBoardView {...baseProps} groups={aRefreshPayload} />)

      // A takes the server's word for it…
      expect(stageOf(/Alder Co/)).toBe('consultation')
      expect(screen.getByText('A reconciled')).toBeInTheDocument()
      // …and B, still writing, is NOT dragged back to Inquiry underneath the
      // operator's hands.
      expect(stageOf(/Birch Co/)).toBe('proposal')

      await act(async () => { settle.B() })
      expect(stageOf(/Birch Co/)).toBe('proposal')
    })

    /*
      Rollback used to restore a whole-array snapshot taken before the optimistic
      update, so a rejection on card B also reverted everything that had landed
      since — including card A's successful move and its refreshed sentence,
      unrecoverably: `syncedFrom` already equalled that payload, so the sync
      block would never re-apply it.
    */
    it('rolls back only the rejected card, keeping a server payload that landed in between', async () => {
      const settle: Record<string, () => void> = {}
      const reject: Record<string, (e: Error) => void> = {}
      setLeadStage.mockImplementation((_org: string, id: string) =>
        new Promise<void>((res, rej) => { settle[id] = () => res(); reject[id] = rej }))

      const twoInInquiry: PipelineGroups = {
        needs_attention: [], waiting: [],
        active: [
          { lead: lead({ id: 'A', name: 'Alder Co' }), health: 'active', statusLine: 'A line' },
          { lead: lead({ id: 'B', name: 'Birch Co' }), health: 'active', statusLine: 'B line' },
        ],
      }
      const { rerender } = render(<PipelineBoardView {...baseProps} groups={twoInInquiry} />)

      // (1) A drops. (2) B drops WHILE A is still writing — this is the moment
      // the old code snapshotted the whole array, and the snapshot predates
      // everything that lands next.
      const dtA = dataTransfer()
      fireEvent.dragStart(screen.getByRole('article', { name: /Alder Co/ }), { dataTransfer: dtA })
      fireEvent.drop(dropzone('consultation'), { dataTransfer: dtA })
      const dtB = dataTransfer()
      fireEvent.dragStart(screen.getByRole('article', { name: /Birch Co/ }), { dataTransfer: dtB })
      fireEvent.drop(dropzone('proposal'), { dataTransfer: dtB })

      // (3) A succeeds and its refresh payload lands — fresh column, fresh
      // health, fresh sentence.
      await act(async () => { settle.A() })
      rerender(<PipelineBoardView {...baseProps} groups={{
        needs_attention: [], waiting: [],
        active: [
          { lead: lead({ id: 'A', name: 'Alder Co', stage: 'consultation' }), health: 'active', statusLine: 'A reconciled' },
          { lead: lead({ id: 'B', name: 'Birch Co' }), health: 'active', statusLine: 'B line' },
        ],
      }} />)
      expect(screen.getByText('A reconciled')).toBeInTheDocument()

      // (4) THEN B's write is refused.
      await act(async () => { reject.B(new Error('Permission denied')) })

      await waitFor(() => expect(screen.getByText('Permission denied')).toBeInTheDocument())
      expect(stageOf(/Birch Co/)).toBe('inquiry')
      // A is untouched by B's failure. The whole-array snapshot reverted A's
      // column AND its sentence here, unrecoverably.
      expect(stageOf(/Alder Co/)).toBe('consultation')
      expect(screen.getByText('A reconciled')).toBeInTheDocument()
    })

    it('puts a rejected Closed Won back on the board where it was', async () => {
      setLeadStage.mockRejectedValue(new Error('Permission denied'))
      render(<PipelineBoardView {...baseProps} />)
      fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Closed Won' }))

      await waitFor(() => expect(screen.getByText('Permission denied')).toBeInTheDocument())
      expect(stageOf(/Halcyon Studios/)).toBe('inquiry')
      expect(push).not.toHaveBeenCalled()
    })

    it('ignores a drop whose payload is not a card on this board', () => {
      render(<PipelineBoardView {...baseProps} />)
      const dt = dataTransfer()
      dt.setData('text/plain', 'not-a-lead')
      fireEvent.drop(dropzone('proposal'), { dataTransfer: dt })
      expect(setLeadStage).not.toHaveBeenCalled()
    })

    // Routed from P2's review, defect (a). Base UI's MenuTrigger opens on
    // MOUSEDOWN, so a press-and-drag that starts on the chip pops the stage menu
    // on the same frame the drag begins. The chip watches its own draggable
    // ancestor — which only works while the card KEEPS `draggable="true"`.
    it('closes an open stage menu when the card it sits on starts dragging', async () => {
      render(<PipelineBoardView {...baseProps} />)
      const card = screen.getByRole('article', { name: /Halcyon Studios/ })
      expect(card.getAttribute('draggable')).toBe('true')

      fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
      expect(screen.getByRole('menuitem', { name: 'Mark lost' })).toBeInTheDocument()

      fireEvent.dragStart(card, { dataTransfer: dataTransfer() })
      await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Mark lost' })).toBeNull())
    })

    /*
      The OTHER half of routed defect (a), and the branch that actually matters:
      StageChip's `handleOpenChange` guard (`if (next && draggingRef.current)
      return`). Base UI's useClick schedules `store.setOpen(true)` inside a
      `frame.request`, so on a fast press-and-drag the dragstart frequently WINS
      the race and arrives first — the close-on-dragstart path above never runs,
      and only this guard stops the menu popping open over a card in flight.
      Delete the guard and the test above still passes; this one does not.
    */
    it('refuses to open the stage menu while its card is mid-drag, and recovers on dragend', async () => {
      render(<PipelineBoardView {...baseProps} />)
      const card = screen.getByRole('article', { name: /Halcyon Studios/ })

      // dragstart FIRST — the open request loses the race.
      fireEvent.dragStart(card, { dataTransfer: dataTransfer() })
      fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
      expect(screen.queryByRole('menuitem', { name: 'Mark lost' })).toBeNull()

      // `draggingRef` must be released on dragend, or the chip is dead for the
      // rest of the card's life.
      fireEvent.dragEnd(card)
      fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
      await waitFor(() =>
        expect(screen.getByRole('menuitem', { name: 'Mark lost' })).toBeInTheDocument())
    })

    // Routed from P2's review, defect (b). The kit popup is portalled to
    // <body>, so the column's own overflow does NOT clip it: scrolling past an
    // open card left the menu floating over the column header. The chip closes
    // itself from its clipping scrollers, which requires the dropzone to remain
    // a resolvable `overflow-y: auto` ancestor.
    it('closes an open stage menu when its board column scrolls', async () => {
      render(<PipelineBoardView {...baseProps} />)
      const scroller = dropzone('inquiry')
      expect(getComputedStyle(scroller).overflowY).toBe('auto')

      fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
      expect(screen.getByRole('menuitem', { name: 'Mark lost' })).toBeInTheDocument()

      fireEvent.scroll(scroller)
      await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Mark lost' })).toBeNull())
    })
  })

  /*
    buildPipelineRows computes a toned Countdown for every waiting and active
    row and the BOARD THREW IT AWAY: overdue-ness reached the operator only as a
    date inside `row.statusLine`, grey prose indistinguishable at a glance from
    a task due next week. Same pill, same tones as the list — one module, one
    per-state tone rule.
  */
  describe('countdown tone', () => {
    const withCountdown = (text: string, tone: 'alert' | 'pending' | 'neutral') => ({
      needs_attention: [], waiting: [],
      active: [{
        lead: lead({ estimated_value: 1200 }), health: 'active' as const,
        statusLine: 'Next: Send options', countdown: { text, tone },
      }],
    })

    it.each([
      ['overdue', '2 days overdue', 'alert' as const],
      ['today', 'Today', 'pending' as const],
      ['upcoming', 'in 6 days', 'neutral' as const],
    ])('paints a %s card countdown with its own StatusPill tone', (_s, text, tone) => {
      render(<PipelineBoardView {...baseProps} groups={withCountdown(text, tone)} />)
      const pill = screen.getByText(text)
      expect(pill.getAttribute('data-slot')).toBe('status-pill')
      expect(pill.className).toContain(`var(--status-${tone}-bg)`)
    })

    // The hard case: overdue is RED on the card, not whatever tone the component
    // happened to be handed.
    it('paints an overdue card countdown in the alert token specifically', () => {
      render(<PipelineBoardView {...baseProps} groups={withCountdown('2 days overdue', 'alert')} />)
      const pill = screen.getByText('2 days overdue')
      expect(pill.className).toContain('var(--status-alert-bg)')
      expect(pill.className).not.toContain('var(--status-neutral-bg)')
    })

    it('renders no pill at all for a row with no due date', () => {
      const { container } = render(<PipelineBoardView {...baseProps} />)
      const card = screen.getByRole('article', { name: /Halcyon Studios/ })
      expect(card.querySelectorAll('[data-slot="status-pill"]')).toHaveLength(1) // the StageChip's own
      expect(container.textContent).not.toContain('overdue')
    })
  })

  describe('empty columns', () => {
    it('offers the forward move — advance the oldest deal from the stage before', async () => {
      render(<PipelineBoardView {...baseProps} />)
      const cta = screen.getByRole('button', { name: /Move Halcyon Studios here/ })
      expect(column('consultation').textContent).toContain('Nothing in Consultation')
      fireEvent.click(cta)
      await waitFor(() => expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'consultation'))
    })

    it('falls back to New opportunity when there is nothing to advance', () => {
      render(<PipelineBoardView {...baseProps} groups={{ needs_attention: [], waiting: [], active: [] }} />)
      expect(column('inquiry').textContent).toContain('Nothing in Inquiry')
      // Three empty columns: Inquiry has no predecessor, and Consultation and
      // Proposal have empty predecessors, so all three fall back.
      const inquiryCta = column('inquiry').querySelector('button') as HTMLElement
      expect(inquiryCta.textContent).toBe('New opportunity')
      fireEvent.click(inquiryCta)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  // The board seeded `rows` from props exactly once, so router.refresh() never
  // reconciled anything and a moved card kept its pre-move sentence forever.
  it('reconciles stale status sentences when the server sends new rows', () => {
    const { rerender } = render(<PipelineBoardView {...baseProps} />)
    expect(screen.getByText('Waiting on reply')).toBeInTheDocument()

    const fresh: PipelineGroups = {
      needs_attention: [{
        lead: lead({ estimated_value: 1200 }),
        health: 'needs_attention',
        statusLine: 'No next step — last touched 11 days ago',
      }],
      waiting: [], active: [],
    }
    rerender(<PipelineBoardView {...baseProps} groups={fresh} />)
    expect(screen.getByText('No next step — last touched 11 days ago')).toBeInTheDocument()
    expect(screen.queryByText('Waiting on reply')).toBeNull()
  })

  it('mounts the create form in a dialog rather than inline above the board', () => {
    render(<PipelineBoardView {...baseProps} />)
    expect(screen.queryByLabelText('Event type')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'New opportunity' })[0])
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog.querySelector('#leadEventType')).toBeTruthy()
  })
})
