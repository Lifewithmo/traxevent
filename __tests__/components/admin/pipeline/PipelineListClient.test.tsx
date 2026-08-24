import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { PipelineListClient } from '@/components/admin/pipeline/PipelineListClient'
import { DUE_TONE } from '@/lib/pipeline-presentation'
import type { Lead } from '@/lib/types'

const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
vi.mock('@/actions/nudge', () => ({ nudgeProposal: vi.fn() }))
// 'use server' modules backed by firebase-admin — mocked like NewOpportunityForm's
// createLead mock in new-opportunity-form-linked.test.tsx.
const setLeadStage = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({ createLead: vi.fn(), setLeadStage: (...args: unknown[]) => setLeadStage(...args) }))
vi.mock('@/actions/intake', () => ({
  ensureIntakeToken: vi.fn().mockResolvedValue('tok123'),
  regenerateIntakeToken: vi.fn().mockResolvedValue('tok456'),
}))

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Halcyon Studios', stage: 'proposal', created_at: 't', updated_at: 't', ...over,
} as Lead)

const baseProps = {
  orgId: 'o1', orgSlug: 'demo',
  groups: {
    needs_attention: [{ lead: lead({}), health: 'needs_attention' as const, statusLine: 'Proposal sent 6 days ago — no opens' }],
    waiting: [], active: [],
  },
  closed: [],
  openCount: 1,
  monthly: { wonCount: 2, wonValue: 6300, lostCount: 1, lostValue: 800 },
}

const emptyGroups = { needs_attention: [], waiting: [], active: [] }

/**
 * The first group header's rollup line, read whole. `getByText('$4,500')` is
 * ambiguous here on purpose — the group's sum and the single row's own money
 * legitimately print the same string — and the line spans an element boundary,
 * so it has to come off the containing <p>.
 */
const groupRollup = (container: HTMLElement) =>
  (container.querySelector('section p') as HTMLElement).textContent

describe('PipelineListClient', () => {
  beforeEach(() => {
    // mockReset, not mockClear: the in-flight test installs a deferred
    // implementation that would otherwise hang every test after it.
    setLeadStage.mockReset().mockResolvedValue(undefined)
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

  it('renders exactly one intake link control block', () => {
    const { container } = render(<PipelineListClient {...baseProps} />)
    expect(screen.getAllByRole('button', { name: 'Intake link' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Intake link' }))
    expect(container.querySelectorAll('[data-intake-card]')).toHaveLength(1)
  })

  /*
    DUPLICATE FIGURE. `monthly.wonValue` is `wonValueInMonth(leads, ym)` and the
    KPI band ON THIS SAME PAGE renders that identical call as "Booked this
    month" (leads/page.tsx:57 → PipelineStatsHeader:127); see the proof in
    __tests__/lib/pipeline-view.test.ts. So this surface renders the LOSS side
    and the route to the calendar, and nothing else — the won money and the won
    count belong to the band alone.
  */
  it('shows the month rollup as the lost figure only, never restating the band’s won money', () => {
    render(<PipelineListClient {...baseProps} />)
    expect(screen.getByText('Lost this month')).toBeInTheDocument()
    expect(screen.getByText('$800')).toBeInTheDocument()
    expect(screen.getByText('1 lost · archived')).toBeInTheDocument()

    expect(screen.queryByText('Won this month')).toBeNull()
    // 6300 is `monthly.wonValue` — the band's "Booked this month" figure.
    expect(screen.queryByText('$6,300')).toBeNull()
    expect(screen.queryByText(/2 won/)).toBeNull()
  })

  it('keeps the calendar affordance, which is navigation rather than a restated figure', () => {
    render(<PipelineListClient {...baseProps} />)
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('href', '/demo/calendar')
  })

  it('renders a needs-attention statusLine in the destructive tone', () => {
    render(<PipelineListClient {...baseProps} />)
    const line = screen.getByText('Proposal sent 6 days ago — no opens')
    expect(line.className).toContain('text-destructive')
  })

  it('renders a flat row with a destructive left accent when needs attention', () => {
    const { container } = render(<PipelineListClient {...baseProps} />)
    const row = container.querySelector('[data-row="l1"]') as HTMLElement
    expect(row).toBeTruthy()
    // The accent moved off inline `style` onto tokens so dark mode and the
    // hover/focus rules can reach it.
    expect(row.className).toContain('border-l-destructive')
    expect(row.style.borderLeft).toBe('')
  })

  it('renders a StageChip per row', () => {
    render(<PipelineListClient {...baseProps} />)
    expect(screen.getByRole('button', { name: /Stage: Proposal/ })).toBeInTheDocument()
  })

  it('leads each row with an Avatar', () => {
    render(<PipelineListClient {...baseProps} />)
    expect(screen.getByRole('img', { name: 'Halcyon Studios' })).toBeInTheDocument()
  })

  it('shows an advance button labeled with the next stage and calls setLeadStage', async () => {
    render(<PipelineListClient {...baseProps} />)
    const advance = screen.getByRole('button', { name: 'Move to Closed Won' })
    await act(async () => { fireEvent.click(advance) })
    expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'closed_won')
  })

  /*
    Unlike the board, this surface has no optimistic move — nothing on screen
    changed for the whole round trip, which is exactly what provokes a second
    click. `setLeadStage` writes an activity-log entry on EVERY call
    (actions/leads.ts:106-116), so a double click stamped two identical
    "Stage -> closed_won" entries on the timeline and fired `?convert=1` twice.

    THE `disabled` ATTRIBUTE ONLY. This asserts the button's own state and the
    happy path; it does NOT prove the handler guard, because React/jsdom never
    dispatch a click on a disabled <button> to the handler. (An earlier version
    claimed it did — deleting the guard left it green.) The guard is pinned by
    'refuses a second stage change on a row whose move is in flight…' below,
    which goes in through the stage MENU, a control that stays enabled.
  */
  it('shows a pending label and disables the advance button while the move is in flight', async () => {
    let settle: () => void = () => {}
    setLeadStage.mockImplementation(() => new Promise<void>((res) => { settle = () => res() }))

    render(<PipelineListClient {...baseProps} />)
    const advance = screen.getByRole('button', { name: 'Move to Closed Won' })
    fireEvent.click(advance)

    const moving = screen.getByRole('button', { name: 'Moving…' })
    expect(moving).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Move to Closed Won' })).toBeNull()

    await act(async () => { settle() })
    expect(setLeadStage).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/demo/leads/l1?convert=1')
  })

  /*
    THE GUARD, through a route that is genuinely live during the move. The kit
    StageChip takes no `disabled` prop and components/ui is not ours to change,
    so the row's stage menu stays fully operable while its advance button reads
    "Moving…" — which makes it the only honest way to reach `handleStageChange`
    a second time, and the reason the guard has to exist at all.
  */
  it('refuses a second stage change on a row whose move is in flight, and says so', async () => {
    setLeadStage.mockImplementation(() => new Promise<void>(() => {}))

    render(<PipelineListClient {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move to Closed Won' }))
    expect(setLeadStage).toHaveBeenCalledTimes(1)

    // The stage menu is NOT disabled — it opens mid-move.
    fireEvent.click(screen.getByRole('button', { name: /Stage: Proposal/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Consultation' }))

    expect(setLeadStage).toHaveBeenCalledTimes(1)
    // …and the refusal is not silent: it lands in the live region.
    expect(screen.getByText('Halcyon Studios is still moving — wait for that change to land.'))
      .toBeInTheDocument()
  })

  /*
    The guard used to be GLOBAL (`if (moving) return`) while the disabled state
    was per row, so row B's button was enabled, its menu opened, and clicking
    either did nothing whatsoever while row A was writing — no call, no error,
    no label, nothing announced.
  */
  it('lets a different row advance normally while another row is still writing', async () => {
    const settle: Record<string, () => void> = {}
    setLeadStage.mockImplementation((_org: string, id: string) =>
      new Promise<void>((res) => { settle[id] = () => res() }))

    render(<PipelineListClient {...baseProps} groups={{
      ...emptyGroups,
      active: [
        { lead: lead({ id: 'A', name: 'Alder Co', stage: 'proposal' }), health: 'active', statusLine: 'A line' },
        { lead: lead({ id: 'B', name: 'Birch Co', stage: 'inquiry' }), health: 'active', statusLine: 'B line' },
      ],
    }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Move to Closed Won' }))
    // B's own control is still live, and it WORKS.
    const bAdvance = screen.getByRole('button', { name: 'Move to Consultation' })
    expect(bAdvance).toBeEnabled()
    fireEvent.click(bAdvance)

    expect(setLeadStage).toHaveBeenCalledTimes(2)
    expect(setLeadStage).toHaveBeenNthCalledWith(2, 'o1', 'B', 'consultation')
    // Both rows report their own state; one slot of `moving` could not.
    expect(screen.getAllByRole('button', { name: 'Moving…' })).toHaveLength(2)

    await act(async () => { settle.A(); settle.B() })
  })

  /*
    THE REFRESH-LAG WINDOW, which is the rest of the duplicate-write path the
    guard was added for. `setLeadStage` resolving is NOT the end of the move:
    `router.refresh()` is fire-and-forget and this page is `force-dynamic`, so
    for the whole RSC round trip the row keeps rendering the STALE prop stage.
    Re-arming on the promise put the advance button back reading "Move to
    Consultation" and left the same-stage early return comparing against that
    stale stage — a second click therefore fired a second `setLeadStage`, and
    that action writes an activity entry on EVERY call (actions/leads.ts:112).

    THE MOUNTED PROPS ARE THE CLOCK HERE. The first half of this test runs
    entirely AFTER the write has resolved (note the `await act` around the
    click), which is exactly the window a promise-scoped guard cannot see.
  */
  it('keeps the row locked from the resolved write until the refreshed stage lands', async () => {
    const inquiryRow = {
      ...emptyGroups,
      active: [{ lead: lead({ id: 'l1', stage: 'inquiry' as const }), health: 'active' as const, statusLine: 'x' }],
    }
    const { rerender } = render(<PipelineListClient {...baseProps} groups={inquiryRow} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move to Consultation' })) })

    expect(setLeadStage).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    // The write has RESOLVED. The payload has not landed — props still say
    // Inquiry — so the row is still moving and says so.
    expect(screen.getByRole('button', { name: 'Moving…' })).toBeDisabled()

    // …and the stage MENU, which the kit gives no way to disable, still refuses.
    fireEvent.click(screen.getByRole('button', { name: /Stage: Inquiry/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Proposal' }))
    expect(setLeadStage).toHaveBeenCalledTimes(1)

    // The refreshed payload arrives; the row re-arms on its NEW stage.
    rerender(<PipelineListClient {...baseProps} groups={{
      ...emptyGroups,
      active: [{ lead: lead({ id: 'l1', stage: 'consultation' as const }), health: 'active' as const, statusLine: 'x' }],
    }} />)
    expect(screen.getByRole('button', { name: 'Move to Proposal' })).toBeEnabled()
  })

  /*
    A payload that DISAGREES with the move still re-arms the row. The mark is
    held against the stage the move started FROM, not the one it aimed at, so a
    lost race (someone else moved the deal, the write silently did not apply)
    cannot strand the row at a disabled "Moving…" for the rest of the session.
  */
  it('re-arms the row on any fresh payload, not only one carrying the requested stage', async () => {
    const inquiryRow = {
      ...emptyGroups,
      active: [{ lead: lead({ id: 'l1', stage: 'inquiry' as const }), health: 'active' as const, statusLine: 'x' }],
    }
    const { rerender } = render(<PipelineListClient {...baseProps} groups={inquiryRow} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move to Consultation' })) })
    expect(screen.getByRole('button', { name: 'Moving…' })).toBeDisabled()

    rerender(<PipelineListClient {...baseProps} groups={{
      ...emptyGroups,
      active: [{ lead: lead({ id: 'l1', stage: 'proposal' as const }), health: 'active' as const, statusLine: 'x' }],
    }} />)
    expect(screen.getByRole('button', { name: 'Move to Closed Won' })).toBeEnabled()
  })

  /*
    THE REFUSAL HAS TO SURVIVE THE MOVE IT WARNED ABOUT. The `finally` that used
    to clear `moving` also called `setNotice(null)`, so the sequence below —
    refuse the second pick, then let the first write land — erased the only
    trace of a stage change the operator explicitly made and the app silently
    discarded. They were left looking at a deal in Consultation, having picked
    Proposal, with nothing on screen saying why.

    Note the shape: the earlier in-flight test mocks `setLeadStage` as a promise
    that NEVER settles, so its `finally` never runs and it is structurally
    incapable of observing this. This one settles.
  */
  it('keeps the refusal on screen after the in-flight move it warned about lands', async () => {
    let settle: () => void = () => {}
    setLeadStage.mockImplementation(() => new Promise<void>((res) => { settle = () => res() }))

    render(<PipelineListClient {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move to Closed Won' }))

    fireEvent.click(screen.getByRole('button', { name: /Stage: Proposal/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Consultation' }))
    const refusal = 'Halcyon Studios is still moving — wait for that change to land.'
    expect(screen.getByText(refusal)).toBeInTheDocument()

    await act(async () => { settle() })
    expect(screen.getByText(refusal)).toBeInTheDocument()
  })

  /*
    …and a DIFFERENT row's completing move must not erase it either: `notice` is
    global while `moving` is per row, so row B's `finally` used to wipe the
    refusal row A had just raised.
  */
  it('keeps one row’s refusal on screen when a different row’s move lands', async () => {
    const settle: Record<string, () => void> = {}
    setLeadStage.mockImplementation((_org: string, id: string) =>
      new Promise<void>((res) => { settle[id] = () => res() }))

    render(<PipelineListClient {...baseProps} groups={{
      ...emptyGroups,
      active: [
        { lead: lead({ id: 'A', name: 'Alder Co', stage: 'proposal' }), health: 'active', statusLine: 'A line' },
        { lead: lead({ id: 'B', name: 'Birch Co', stage: 'inquiry' }), health: 'active', statusLine: 'B line' },
      ],
    }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Move to Closed Won' }))   // A
    fireEvent.click(screen.getByRole('button', { name: 'Move to Consultation' })) // B

    // A's stage menu is still live; the second pick on A is refused.
    fireEvent.click(screen.getByRole('button', { name: /Stage: Proposal/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Consultation' }))
    const refusal = 'Alder Co is still moving — wait for that change to land.'
    expect(screen.getByText(refusal)).toBeInTheDocument()

    // B settles. A's refusal is not B's to clear.
    await act(async () => { settle.B() })
    expect(screen.getByText(refusal)).toBeInTheDocument()

    await act(async () => { settle.A() })
  })

  /*
    The error path's re-arm. Without it a refused move leaves the row
    permanently stuck at a disabled "Moving…" and the operator cannot retry
    without a full page load.
  */
  it('re-arms the row after a rejected move so it can be retried', async () => {
    setLeadStage.mockRejectedValueOnce(new Error('Permission denied'))

    render(<PipelineListClient {...baseProps} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move to Closed Won' })) })

    expect(screen.getByText('Permission denied')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Move to Closed Won' })
    expect(retry).toBeEnabled()

    await act(async () => { fireEvent.click(retry) })
    expect(setLeadStage).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenCalledWith('/demo/leads/l1?convert=1')
  })

  it('shows Move to Consultation for an inquiry-stage row', () => {
    const props = {
      ...baseProps,
      groups: {
        needs_attention: [],
        waiting: [],
        active: [{ lead: { id: 'l2', name: 'Foo', stage: 'inquiry' as const, created_at: 't', updated_at: 't' } as Lead, health: 'active' as const, statusLine: 'Waiting on reply' }],
      },
    }
    render(<PipelineListClient {...props} />)
    expect(screen.getByRole('button', { name: 'Move to Consultation' })).toBeInTheDocument()
  })

  describe('tone', () => {
    // The countdown was one grey `Badge variant="secondary"` for every state, so
    // "3 days overdue" and "in 3 days" looked identical on a scan.
    /*
      A WIRING check only, and it must be read as one: it feeds `tone` in as a
      prop and asserts the pill carries `var(--status-${tone}-bg)`, which is
      true for ANY tone the component forwards. The colour DECISION is pinned
      against literals in __tests__/lib/pipeline-view.test.ts, where it is made.
    */
    it.each([
      ['overdue', '3 days overdue', DUE_TONE.overdue],
      ['today', 'Today', DUE_TONE.today],
      ['upcoming', 'in 3 days', DUE_TONE.upcoming],
    ])('forwards a %s countdown tone onto the StatusPill', (_status, text, tone) => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [{ lead: lead({}), health: 'active', statusLine: 'Next: call', countdown: { text, tone } }],
      }} />)
      const pill = screen.getByText(text)
      expect(pill.getAttribute('data-slot')).toBe('status-pill')
      expect(pill.className).toContain(`var(--status-${tone}-bg)`)
    })

    // One hard case here too: overdue is RED on this surface, literally.
    it('paints an overdue countdown in the alert token specifically', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [{
          lead: lead({}), health: 'active', statusLine: 'Next: call',
          countdown: { text: '3 days overdue', tone: 'alert' },
        }],
      }} />)
      const pill = screen.getByText('3 days overdue')
      expect(pill.className).toContain('var(--status-alert-bg)')
      expect(pill.className).toContain('var(--status-alert-fg)')
    })

    // A loss is not money earned, so it does not wear the money/success token.
    it('keeps the money token off a lost deal’s value', () => {
      const { container } = render(<PipelineListClient {...baseProps} groups={emptyGroups} closed={[
        lead({ id: 'w1', name: 'Won Co', stage: 'closed_won', estimated_value: 4000 }),
        lead({ id: 'x1', name: 'Lost Co', stage: 'closed_lost', estimated_value: 2750 }),
      ]} />)
      fireEvent.click(screen.getByRole('button', { name: /^Closed \(2\)/ }))
      const amountIn = (id: string) => Array.from(
        (container.querySelector(`[data-row="${id}"]`) as HTMLElement).querySelectorAll('span')
      ).find((s) => s.textContent?.startsWith('$')) as HTMLElement

      expect(amountIn('w1').textContent).toBe('$4,000')
      expect(amountIn('w1').className).toContain('var(--money-green)')
      expect(amountIn('x1').textContent).toBe('$2,750')
      expect(amountIn('x1').className).not.toContain('var(--money-green)')
      expect(amountIn('x1').className).toContain('text-muted-foreground')
    })

    it('distinguishes Closed Won from Closed Lost on the closed tab', () => {
      render(<PipelineListClient {...baseProps} groups={emptyGroups} closed={[
        lead({ id: 'w1', name: 'Won Co', stage: 'closed_won' }),
        // A real LostReason — 'price' is not in the union, and the `as` cast was
        // hiding a tsc error that shipped with this file.
        lead({ id: 'x1', name: 'Lost Co', stage: 'closed_lost', lost: { reason: 'over_budget' } }),
      ]} />)
      fireEvent.click(screen.getByRole('button', { name: /^Closed \(2\)/ }))
      const won = screen.getByText('Closed Won')
      const lost = screen.getByText('Closed Lost')
      expect(won.className).toContain('var(--status-confirmed-bg)')
      expect(lost.className).toContain('var(--status-alert-bg)')
      expect(won.className).not.toBe(lost.className)
    })

    it('renders money in the money token with tabular figures', () => {
      const { container } = render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [{ lead: lead({ estimated_value: 1200.5 }), health: 'active', statusLine: 'Next: call' }],
      }} />)
      // money() is cents-correct: a fractional amount keeps exactly two places.
      const row = container.querySelector('[data-row="l1"]') as HTMLElement
      const amount = Array.from(row.querySelectorAll('span'))
        .find((s) => s.textContent === '$1,200.50') as HTMLElement
      expect(amount).toBeTruthy()
      expect(amount.className).toContain('var(--money-green)')
      expect(amount.className).toContain('tabular-nums')
    })
  })

  /*
    THE LABEL NAMES WHAT THE CONTROL DOES. This one navigates — a `?focus=value`
    query the opportunity page ignores would be a dead control — so it must not
    be named after an edit. Called "+ Add value" it promised an add, delivered a
    page, and left the operator hunting for the SECOND "+ Add value", the one on
    the opportunity's KPI band that really does open the editor.
  */
  it('names the unset-estimate affordance for the navigation it performs (R6)', () => {
    render(<PipelineListClient {...baseProps} groups={{
      ...emptyGroups,
      active: [{ lead: lead({}), health: 'active', statusLine: 'Next: call' }],
    }} />)
    const priceIt = screen.getByRole('link', { name: 'Price it' })
    expect(priceIt).toHaveAttribute('href', '/demo/leads/l1')
    // The word that belongs to the control that actually adds one.
    expect(screen.queryByText('+ Add value')).toBeNull()
  })

  it('promotes each group header to a count and a summed value (R2)', () => {
    render(<PipelineListClient {...baseProps} groups={{
      needs_attention: [
        { lead: lead({ id: 'a', estimated_value: 4000 }), health: 'needs_attention', statusLine: 'x' },
        { lead: lead({ id: 'b', estimated_value: 10200 }), health: 'needs_attention', statusLine: 'y' },
      ],
      waiting: [], active: [],
    }} />)
    expect(screen.getByText(/2 opportunities/)).toBeInTheDocument()
    const sum = screen.getByText('$14,200')
    expect(sum.className).toContain('var(--money-green)')
  })

  /*
    THE COUNT AND THE SUM DO NOT COVER THE SAME ROWS. The count is every row in
    the group; the sum only the priced ones — the rest render "Price it" because
    theirs is unset. Silent, "3 opportunities · $4,500" read as though $4,500
    covered all three, and a group where nobody has priced anything read "$0",
    which is a wrong figure rather than an empty one.
  */
  it('says how many rows the group’s sum leaves out', () => {
    const { container } = render(<PipelineListClient {...baseProps} groups={{
      needs_attention: [
        { lead: lead({ id: 'a', estimated_value: 4500 }), health: 'needs_attention', statusLine: 'x' },
        { lead: lead({ id: 'b' }), health: 'needs_attention', statusLine: 'y' },
        { lead: lead({ id: 'c' }), health: 'needs_attention', statusLine: 'z' },
      ],
      waiting: [], active: [],
    }} />)
    expect(groupRollup(container)).toBe('3 opportunities · $4,500 · 2 unpriced')
  })

  it('stays silent about unpriced rows when every row in the group has a value', () => {
    const { container } = render(<PipelineListClient {...baseProps} groups={{
      needs_attention: [{ lead: lead({ id: 'a', estimated_value: 4500 }), health: 'needs_attention', statusLine: 'x' }],
      waiting: [], active: [],
    }} />)
    expect(groupRollup(container)).toBe('1 opportunity · $4,500')
  })

  /*
    ONE zero policy for the module. A COMPUTED ROLLUP always renders, `$0`
    included — the board's column headers and every KPI tile already do, and a
    header that hides its sum at zero reads as "not computed" rather than
    "nothing here yet". (An UNSET per-record estimate is a different thing and
    still gets "+ Add value", asserted above.)
  */
  it('renders a zero group rollup as $0 rather than hiding it', () => {
    render(<PipelineListClient {...baseProps} groups={{
      needs_attention: [{ lead: lead({ id: 'a' }), health: 'needs_attention', statusLine: 'x' }],
      waiting: [], active: [],
    }} />)
    const sum = screen.getByText('$0')
    expect(sum.className).toContain('var(--money-green)')
  })

  describe('empty states (R4 — message plus one CTA that moves forward)', () => {
    it('offers New opportunity when the open pipeline is empty', () => {
      render(<PipelineListClient {...baseProps} groups={emptyGroups} openCount={0} />)
      expect(screen.getByText('No open opportunities')).toBeInTheDocument()
      const cta = screen.getAllByRole('button', { name: 'New opportunity' })
      fireEvent.click(cta[cta.length - 1])
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('sends the operator to the open list when nothing needs attention', () => {
      render(<PipelineListClient {...baseProps} groups={emptyGroups} openCount={0} />)
      fireEvent.click(screen.getByRole('button', { name: /^Needs attention/ }))
      expect(screen.getByText('Nothing needs attention')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'See all open' }))
      expect(screen.getByText('No open opportunities')).toBeInTheDocument()
    })

    it('gives the empty closed tab a way out too', () => {
      render(<PipelineListClient {...baseProps} groups={emptyGroups} openCount={0} />)
      fireEvent.click(screen.getByRole('button', { name: /^Closed \(0\)/ }))
      expect(screen.getByText('Nothing closed yet')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'See all open' })).toBeInTheDocument()
    })
  })

  /*
    ONE QUANTITY, ONE WORD. `groups.needs_attention.length` reaches the operator
    three times inside ~80px on /leads — the KPI tile, this tab, and the group
    rule — and used to do so as "Needs action", "Needs a move" and "Needs
    attention", which reads top-to-bottom as three separate queues. The health
    model's own word is `needs_attention`; the tile is pinned to the same string
    in PipelineStatsHeader.test.tsx.
  */
  it('names the needs-attention queue with the health model’s word on both the tab and the rule', () => {
    render(<PipelineListClient {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Needs attention (1)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument()
    expect(screen.queryByText(/needs a move/i)).toBeNull()
    expect(screen.queryByText(/needs action/i)).toBeNull()
  })

  it('mounts the create form in a dialog rather than inline above the list', () => {
    const { container } = render(<PipelineListClient {...baseProps} />)
    expect(container.querySelector('#leadEventType')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'New opportunity' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('#leadEventType')).toBeTruthy()
    // In a portal on <body>, so the pipeline below is not pushed down.
    expect(container.querySelector('#leadEventType')).toBeNull()
  })

  it('wraps the tab bar and the row action cluster instead of overflowing below md (R8)', () => {
    const { container } = render(<PipelineListClient {...baseProps} />)
    const row = container.querySelector('[data-row="l1"]') as HTMLElement
    expect(row.className).toContain('flex-wrap')
    const cluster = row.lastElementChild as HTMLElement
    expect(cluster.className).toContain('flex-wrap')
    expect(cluster.className).not.toContain('shrink-0')
    const tabBar = screen.getByRole('button', { name: /^All open/ }).parentElement as HTMLElement
    expect(tabBar.className).toContain('flex-wrap')
  })

  /*
    THE BOOK-BY RADAR (increment 1). The pipeline ranks by the event deadline
    now, so each open row must SAY its deadline: the event date, the book-by
    date, and how long is left — escalating to alert inside the prep window and
    once it is past due. A same-day booking conflict gets its own loud badge, and
    winning a second job for an already-booked date asks first.
  */
  describe('book-by radar (increment 1)', () => {
    const radarRow = (over: Record<string, unknown>) => ({
      lead: lead({ id: 'r1', name: 'Vale Wedding', stage: 'proposal', event_date: '2026-09-30' }),
      health: 'active' as const,
      statusLine: 'Next: call',
      eventDate: '2026-09-30',
      bookByDate: '2026-09-16',
      daysToBookBy: 30,
      ...over,
    })

    it('renders the book-by urgency chip — event, book-by and days left — as a quiet note when far out', () => {
      render(<PipelineListClient {...baseProps} groups={{ ...emptyGroups, active: [radarRow({})] }} />)
      const chip = screen.getByText('Event Sep 30, 2026 · book by Sep 16, 2026 · 30d left')
      expect(chip.getAttribute('data-slot')).toBe('status-pill')
      // 30 days out is not urgent — it must NOT wear the alert token.
      expect(chip.className).toContain('var(--status-neutral-bg)')
      expect(chip.className).not.toContain('var(--status-alert-bg)')
    })

    // The <= 7 threshold, pinned on both sides so an off-by-one can't pass.
    it('escalates the chip to alert exactly at 7 days out, and stays neutral at 8', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [
          radarRow({ lead: lead({ id: 'seven', stage: 'proposal', event_date: '2026-09-30' }), daysToBookBy: 7 }),
          radarRow({ lead: lead({ id: 'eight', stage: 'proposal', event_date: '2026-10-01' }), daysToBookBy: 8 }),
        ],
      }} />)
      expect(screen.getByText(/7d left/).className).toContain('var(--status-alert-bg)')
      expect(screen.getByText(/8d left/).className).toContain('var(--status-neutral-bg)')
      expect(screen.getByText(/8d left/).className).not.toContain('var(--status-alert-bg)')
    })

    it('reads "past due" in the alert tone once the book-by date has slipped', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups, active: [radarRow({ daysToBookBy: -3 })],
      }} />)
      const chip = screen.getByText('Event Sep 30, 2026 · book by Sep 16, 2026 · 3d past due')
      expect(chip.className).toContain('var(--status-alert-bg)')
    })

    it('renders no book-by chip at all for a lead with no event date', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [{ lead: lead({ id: 'nd', stage: 'proposal' }), health: 'active', statusLine: 'Next: call' }],
      }} />)
      expect(screen.queryByText(/book by/)).toBeNull()
      expect(screen.queryByText(/Date conflict/)).toBeNull()
    })

    it('renders an alert-tone conflict badge on a double-booked date, and none otherwise', () => {
      const { rerender } = render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups, active: [radarRow({ conflict: true })],
      }} />)
      const badge = screen.getByText('Date conflict — Sep 30, 2026')
      expect(badge.getAttribute('data-slot')).toBe('status-pill')
      expect(badge.className).toContain('var(--status-alert-bg)')

      rerender(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups, active: [radarRow({ conflict: false })],
      }} />)
      expect(screen.queryByText(/Date conflict/)).toBeNull()
    })

    /*
      SAME-DAY WON GUARD. Capacity is 1: closing a second job onto a date that
      already carries a `closed_won` is warned, and a declined confirm must leave
      the row untouched — no `setLeadStage`, no navigation.
    */
    it('warns before winning a second job on an already-booked date and aborts on cancel', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      render(<PipelineListClient {...baseProps}
        groups={{ ...emptyGroups, active: [
          { lead: lead({ id: 'open1', name: 'Second Wedding', stage: 'proposal', event_date: '2026-09-30' }),
            health: 'active', statusLine: 'x', eventDate: '2026-09-30', bookByDate: '2026-09-16', daysToBookBy: 5 },
        ] }}
        closed={[lead({ id: 'won1', name: 'Booked Co', stage: 'closed_won', event_date: '2026-09-30' })]}
      />)
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move to Closed Won' })) })
      expect(confirmSpy).toHaveBeenCalledWith('Another job is already booked for Sep 30, 2026. Book this one too?')
      expect(setLeadStage).not.toHaveBeenCalled()
      expect(push).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('proceeds with the won move when the double-book warning is confirmed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      render(<PipelineListClient {...baseProps}
        groups={{ ...emptyGroups, active: [
          { lead: lead({ id: 'open1', stage: 'proposal', event_date: '2026-09-30' }),
            health: 'active', statusLine: 'x' },
        ] }}
        closed={[lead({ id: 'won1', stage: 'closed_won', event_date: '2026-09-30' })]}
      />)
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move to Closed Won' })) })
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(setLeadStage).toHaveBeenCalledWith('o1', 'open1', 'closed_won')
      confirmSpy.mockRestore()
    })

    it('does not warn when no won job shares the date', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm')
      render(<PipelineListClient {...baseProps}
        groups={{ ...emptyGroups, active: [
          { lead: lead({ id: 'open1', stage: 'proposal', event_date: '2026-09-30' }),
            health: 'active', statusLine: 'x' },
        ] }}
        closed={[lead({ id: 'won1', stage: 'closed_won', event_date: '2026-10-15' })]}
      />)
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move to Closed Won' })) })
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(setLeadStage).toHaveBeenCalledWith('o1', 'open1', 'closed_won')
      confirmSpy.mockRestore()
    })
  })

  /*
    CAPACITY-AWARE RADAR COPY (increment 1 · resource-aware). For a business-tier
    org that has configured units, a row carries `overCapacity` (a CapacityDay)
    and the badge stops being the binary "Date conflict": it names the
    denominator that broke — "Over capacity — N events · M carts (date)" — so the
    operator reads the shortfall, not merely a flag. Base/solo orgs never carry
    `overCapacity` and keep the increment-1 "Date conflict" copy byte-for-byte.
  */
  describe('capacity-aware radar copy', () => {
    const capRow = (overCapacity: Record<string, unknown>, conflict = true) => ({
      lead: lead({ id: 'cap1', name: 'Saturday Rush', stage: 'proposal', event_date: '2026-09-30' }),
      health: 'active' as const,
      statusLine: 'Next: call',
      eventDate: '2026-09-30',
      conflict,
      overCapacity,
    })

    it('names the mobile shortfall — "N events · M carts" — instead of a bare conflict flag', () => {
      render(<PipelineListClient {...baseProps} resourceLabels={{ mobile: { one: 'cart', many: 'carts' } }} groups={{
        ...emptyGroups,
        active: [capRow({
          date: '2026-09-30', over: true,
          detail: [{ kind: 'mobile', demand: 4, supply: 3 }, { kind: 'venue', demand: 0, supply: 2 }],
        })],
      }} />)
      const pill = screen.getByText('Over capacity — 4 events · 3 carts (Sep 30, 2026)')
      expect(pill.getAttribute('data-slot')).toBe('status-pill')
      expect(pill.className).toContain('var(--status-alert-bg)')
      // Reuses the #115 wrap fix so the longer copy does not clip at 375.
      expect(pill.className).toContain('max-w-full')
      expect(pill.className).toContain('whitespace-normal')
      // Capacity copy REPLACES the increment-1 badge; it must not double up.
      expect(screen.queryByText(/Date conflict/)).toBeNull()
    })

    it('names a room shortfall as "rooms", not "carts", when the venue is the breach', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [capRow({
          date: '2026-09-30', over: true,
          detail: [{ kind: 'mobile', demand: 3, supply: 3 }, { kind: 'venue', demand: 3, supply: 2 }],
        })],
      }} />)
      expect(screen.getByText('Over capacity — 3 events · 2 rooms (Sep 30, 2026)')).toBeInTheDocument()
    })

    it('leads with the larger overage when both kinds breach', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [capRow({
          date: '2026-09-30', over: true,
          // mobile over by 2 (5−3); venue over by 3 (4−1) — the sharper shortfall wins.
          detail: [{ kind: 'mobile', demand: 5, supply: 3 }, { kind: 'venue', demand: 4, supply: 1 }],
        })],
      }} />)
      expect(screen.getByText('Over capacity — 4 events · 1 room (Sep 30, 2026)')).toBeInTheDocument()
      expect(screen.queryByText(/carts/)).toBeNull()
    })

    it('shows no capacity or conflict badge when capacity mode reports the day is under capacity', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [capRow({
          date: '2026-09-30', over: false,
          detail: [{ kind: 'mobile', demand: 2, supply: 3 }, { kind: 'venue', demand: 0, supply: 2 }],
        }, false)],
      }} />)
      expect(screen.queryByText(/Over capacity/)).toBeNull()
      expect(screen.queryByText(/Date conflict/)).toBeNull()
    })

    it('keeps the increment-1 "Date conflict" copy for a base org with no capacity data (backstop)', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [{
          lead: lead({ id: 'b1', stage: 'proposal', event_date: '2026-09-30' }),
          health: 'active', statusLine: 'x', eventDate: '2026-09-30', conflict: true,
        }],
      }} />)
      expect(screen.getByText('Date conflict — Sep 30, 2026')).toBeInTheDocument()
      expect(screen.queryByText(/Over capacity/)).toBeNull()
    })
  })

  /*
    DE-SILO (increment 3). The over-capacity pill's kind noun is no longer the
    hardcoded BrewTrax "cart"/"room" — it routes through `kindLabel(org, kind,
    count)`, so the noun is whatever the operator named the CATEGORY in their
    Resources settings (`resource_labels`). A truck op reads "trucks"; an org
    that has named nothing reads the neutral platform default ("serving units").
    The venue default is "room(s)" either way. The base/solo "Date conflict"
    path carries no `overCapacity` and is untouched by any of this.
  */
  describe('operator-labeled resource kinds (de-silo)', () => {
    const capRow = (overCapacity: Record<string, unknown>) => ({
      lead: lead({ id: 'cap1', name: 'Saturday Rush', stage: 'proposal', event_date: '2026-09-30' }),
      health: 'active' as const,
      statusLine: 'Next: call',
      eventDate: '2026-09-30',
      conflict: true,
      overCapacity,
    })
    const mobileOver = {
      date: '2026-09-30', over: true,
      detail: [{ kind: 'mobile', demand: 4, supply: 2 }, { kind: 'venue', demand: 0, supply: 2 }],
    }

    it('reads the operator override — "2 carts" — for a BrewTrax-labeled org', () => {
      render(<PipelineListClient {...baseProps}
        resourceLabels={{ mobile: { one: 'cart', many: 'carts' } }}
        groups={{ ...emptyGroups, active: [capRow(mobileOver)] }} />)
      expect(screen.getByText('Over capacity — 4 events · 2 carts (Sep 30, 2026)')).toBeInTheDocument()
    })

    it('reads a "trucks" override for a mobile-catering op, never "carts"', () => {
      render(<PipelineListClient {...baseProps}
        resourceLabels={{ mobile: { one: 'truck', many: 'trucks' } }}
        groups={{ ...emptyGroups, active: [capRow(mobileOver)] }} />)
      expect(screen.getByText('Over capacity — 4 events · 2 trucks (Sep 30, 2026)')).toBeInTheDocument()
      expect(screen.queryByText(/carts/)).toBeNull()
    })

    it('falls back to the neutral platform default "serving units" when the org has named nothing', () => {
      render(<PipelineListClient {...baseProps}
        groups={{ ...emptyGroups, active: [capRow(mobileOver)] }} />)
      expect(screen.getByText('Over capacity — 4 events · 2 serving units (Sep 30, 2026)')).toBeInTheDocument()
      expect(screen.queryByText(/carts/)).toBeNull()
    })

    it('uses the singular label at a supply of one — "1 serving unit"', () => {
      render(<PipelineListClient {...baseProps}
        groups={{ ...emptyGroups, active: [capRow({
          date: '2026-09-30', over: true,
          detail: [{ kind: 'mobile', demand: 3, supply: 1 }, { kind: 'venue', demand: 0, supply: 2 }],
        })] }} />)
      expect(screen.getByText('Over capacity — 3 events · 1 serving unit (Sep 30, 2026)')).toBeInTheDocument()
    })

    it('labels a venue breach "rooms" by default, independent of the mobile override', () => {
      render(<PipelineListClient {...baseProps}
        resourceLabels={{ mobile: { one: 'truck', many: 'trucks' } }}
        groups={{ ...emptyGroups, active: [capRow({
          date: '2026-09-30', over: true,
          detail: [{ kind: 'mobile', demand: 2, supply: 3 }, { kind: 'venue', demand: 3, supply: 2 }],
        })] }} />)
      expect(screen.getByText('Over capacity — 3 events · 2 rooms (Sep 30, 2026)')).toBeInTheDocument()
    })

    it('leaves the base/solo "Date conflict" path — which carries no labels — byte-for-byte unchanged', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [{
          lead: lead({ id: 'b1', stage: 'proposal', event_date: '2026-09-30' }),
          health: 'active', statusLine: 'x', eventDate: '2026-09-30', conflict: true,
        }],
      }} />)
      expect(screen.getByText('Date conflict — Sep 30, 2026')).toBeInTheDocument()
      expect(screen.queryByText(/serving unit/)).toBeNull()
      expect(screen.queryByText(/Over capacity/)).toBeNull()
    })
  })

  /*
    UNIT DOUBLE-BOOKED BADGE (increment 2). Where the over-capacity pill names a
    type-level shortfall ("3 events · 2 carts"), the clash badge names the
    SPECIFIC unit(s) this row's own booking shares with another on the date —
    "Kart 1 double-booked — <date>" — because "Kart 1" is actionable where a bare
    flag is not. It reads off `rowOwnsClash(row.lead, row.overCapacity)`, is
    independent of the over pill (a row may show both), and never appears for a
    base/solo org that carries no `overCapacity` (the increment-1 path is intact).
  */
  describe('unit double-booked badge (increment 2)', () => {
    // A CapacityDay whose `clashes` name the units double-booked on the date.
    const day = (over: boolean, clashes: Record<string, unknown>[]) => ({
      date: '2026-09-30', over, detail: [], clashes,
    })
    const clashRow = (over: Record<string, unknown>) => ({
      lead: lead({ id: 'cl1', name: 'Saturday Rush', stage: 'proposal', event_date: '2026-09-30' }),
      health: 'active' as const,
      statusLine: 'Next: call',
      eventDate: '2026-09-30',
      conflict: true,
      ...over,
    })

    it('names the specific double-booked unit — "Kart 1 double-booked — <date>"', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [clashRow({
          lead: lead({ id: 'cl1', stage: 'proposal', event_date: '2026-09-30', assigned_units: { mobile: 'k1' } }),
          overCapacity: day(false, [{ unitId: 'k1', unitName: 'Kart 1', kind: 'mobile', count: 2 }]),
        })],
      }} />)
      const pill = screen.getByText('Kart 1 double-booked — Sep 30, 2026')
      expect(pill.getAttribute('data-slot')).toBe('status-pill')
      expect(pill.className).toContain('var(--status-alert-bg)')
      // Reuses the #115 wrap so the copy does not clip at 375.
      expect(pill.className).toContain('max-w-full')
      expect(pill.className).toContain('whitespace-normal')
      // A capacity-mode clash on an UNDER-capacity day shows ONLY the specific
      // badge — never ALSO the binary "Date conflict" pill. The base-mode copy
      // is gated out of capacity mode, so the two never render together.
      expect(screen.queryByText(/Date conflict/)).toBeNull()
    })

    it('names both units when a row owns two clashing units — "Kart 1 & Room A double-booked"', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [clashRow({
          lead: lead({
            id: 'cl1', stage: 'proposal', event_date: '2026-09-30',
            delivery_mode: 'onsite', assigned_units: { mobile: 'k1', venue: 'r1' },
          }),
          overCapacity: day(false, [
            { unitId: 'k1', unitName: 'Kart 1', kind: 'mobile', count: 2 },
            { unitId: 'r1', unitName: 'Room A', kind: 'venue', count: 2 },
          ]),
        })],
      }} />)
      expect(screen.getByText('Kart 1 & Room A double-booked — Sep 30, 2026')).toBeInTheDocument()
    })

    it('renders no clash pill for a row whose own unit is not among the day’s clashes', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [clashRow({
          lead: lead({ id: 'cl1', stage: 'proposal', event_date: '2026-09-30', assigned_units: { mobile: 'k2' } }),
          // The day has a clash, but on a DIFFERENT unit than this row owns.
          overCapacity: day(false, [{ unitId: 'k1', unitName: 'Kart 1', kind: 'mobile', count: 2 }]),
          conflict: false,
        })],
      }} />)
      expect(screen.queryByText(/double-booked/)).toBeNull()
    })

    it('shows the clash badge ALONGSIDE the over-capacity pill when the day is both', () => {
      render(<PipelineListClient {...baseProps} resourceLabels={{ mobile: { one: 'cart', many: 'carts' } }} groups={{
        ...emptyGroups,
        active: [clashRow({
          lead: lead({ id: 'cl1', stage: 'proposal', event_date: '2026-09-30', assigned_units: { mobile: 'k1' } }),
          overCapacity: {
            date: '2026-09-30', over: true,
            detail: [{ kind: 'mobile', demand: 4, supply: 3 }, { kind: 'venue', demand: 0, supply: 2 }],
            clashes: [{ unitId: 'k1', unitName: 'Kart 1', kind: 'mobile', count: 2 }],
          },
        })],
      }} />)
      // Both signals show — the type-level shortfall AND the specific clash.
      expect(screen.getByText('Over capacity — 4 events · 3 carts (Sep 30, 2026)')).toBeInTheDocument()
      expect(screen.getByText('Kart 1 double-booked — Sep 30, 2026')).toBeInTheDocument()
    })

    it('shows no clash badge for a base/solo org that carries no capacity data', () => {
      render(<PipelineListClient {...baseProps} groups={{
        ...emptyGroups,
        active: [{
          lead: lead({ id: 'b1', stage: 'proposal', event_date: '2026-09-30', assigned_units: { mobile: 'k1' } }),
          health: 'active', statusLine: 'x', eventDate: '2026-09-30', conflict: true,
        }],
      }} />)
      // No overCapacity ⇒ rowOwnsClash returns [] ⇒ the increment-1 path only.
      expect(screen.queryByText(/double-booked/)).toBeNull()
      expect(screen.getByText('Date conflict — Sep 30, 2026')).toBeInTheDocument()
    })
  })
})
