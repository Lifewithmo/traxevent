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
  */
  it('shows a pending label and refuses a second click while the advance is in flight', async () => {
    let settle: () => void = () => {}
    setLeadStage.mockImplementation(() => new Promise<void>((res) => { settle = () => res() }))

    render(<PipelineListClient {...baseProps} />)
    const advance = screen.getByRole('button', { name: 'Move to Closed Won' })
    fireEvent.click(advance)

    const moving = screen.getByRole('button', { name: 'Moving…' })
    expect(moving).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Move to Closed Won' })).toBeNull()

    // Even dispatched straight past the disabled attribute, the handler bails.
    fireEvent.click(moving)
    expect(setLeadStage).toHaveBeenCalledTimes(1)

    await act(async () => { settle() })
    expect(push).toHaveBeenCalledTimes(1)
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

  it('offers "+ Add value" instead of nothing when the estimate is unset (R6)', () => {
    render(<PipelineListClient {...baseProps} groups={{
      ...emptyGroups,
      active: [{ lead: lead({}), health: 'active', statusLine: 'Next: call' }],
    }} />)
    const add = screen.getByRole('link', { name: '+ Add value' })
    // A query the opportunity page ignores would be a dead control; plain
    // navigation lands on the rail where the value is actually set.
    expect(add).toHaveAttribute('href', '/demo/leads/l1')
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

    it('sends the operator to the open list when nothing needs a move', () => {
      render(<PipelineListClient {...baseProps} groups={emptyGroups} openCount={0} />)
      fireEvent.click(screen.getByRole('button', { name: /^Needs a move/ }))
      expect(screen.getByText('Nothing needs a move')).toBeInTheDocument()
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
})
