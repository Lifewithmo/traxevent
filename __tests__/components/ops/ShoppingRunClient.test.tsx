import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Server actions are the only wire: everything else in the client is pure
// merge math (lib/ops/shopping-run) + local state.
vi.mock('@/actions/event-ops', () => ({ toggleListItem: vi.fn() }))
vi.mock('@/actions/shopping-run', () => ({ bulkSetRunChecked: vi.fn() }))

import { toggleListItem } from '@/actions/event-ops'
import { bulkSetRunChecked } from '@/actions/shopping-run'
import { ShoppingRunClient, type ShoppingRunClientProps, type ShoppingRunJob } from '@/components/admin/ops/ShoppingRunClient'
import type { ShoppingRunPair } from '@/lib/ops/shopping-run'
import type { OpsListItem, OpsPlan, OpsResource } from '@/lib/types'

function plan(shopping: OpsListItem[]): OpsPlan {
  return {
    package_ids: ['p1'],
    requirements: { guests: 50 },
    deadlines: [],
    shopping_list: shopping,
    packing_list: [],
    checklists: [],
    needs_review: false,
    change_log: [],
    created_at: '2026-08-01T00:00:00.000Z',
  }
}

function mkPair(id: string, name: string, shopping: OpsListItem[]): ShoppingRunPair {
  return { event: { id, name, slug: `event-${id}`, event_start: '2026-08-12' }, plan: plan(shopping) }
}

function mkJob(id: string, name: string, overrides: Partial<ShoppingRunJob> = {}): ShoppingRunJob {
  return { id, name, slug: `event-${id}`, event_start: '2026-08-12', excluded: false, no_plan: false, ...overrides }
}

const milk = (checked: boolean): OpsListItem => ({ resource_id: 'r-milk', name: 'Milk', qty: 2, unit: 'each', checked })
const cups = (checked: boolean): OpsListItem => ({ resource_id: 'r-cups', name: 'Cups', qty: 75, unit: 'each', checked })

const RESOURCES: OpsResource[] = [
  { id: 'r-milk', name: 'Milk', kind: 'consumable', unit: 'each', created_at: '2026-08-01T00:00:00.000Z' },
  { id: 'r-cups', name: 'Cups', kind: 'consumable', unit: 'each', created_at: '2026-08-01T00:00:00.000Z' },
]

function baseProps(overrides: Partial<ShoppingRunClientProps> = {}): ShoppingRunClientProps {
  return {
    orgId: 'o1',
    orgSlug: 'acme',
    days: 7,
    jobs: [mkJob('e1', 'Wedding')],
    pairs: [mkPair('e1', 'Wedding', [milk(false)])],
    excludedIds: [],
    resources: RESOURCES,
    failedReads: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ShoppingRunClient — fresh server reads across scope navigations', () => {
  it('adopts fresh server pairs when the scope re-renders — the mount-time overlay must not shadow them', () => {
    // Mount: Milk unchecked. A teammate checks it off on another device; a
    // window toggle (?days=) is a soft navigation to the same route, so the
    // server re-reads the plan and passes fresh pairs to the SAME instance.
    const { rerender } = render(<ShoppingRunClient {...baseProps()} />)
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'false')

    rerender(<ShoppingRunClient {...baseProps({ pairs: [mkPair('e1', 'Wedding', [milk(true)])] })} />)
    // Server truth, not the stale mount-time state.
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'true')
  })

  it('preserves the DISPLAYED state of an unsettled write through the fresh-props merge (no silent revert)', async () => {
    let settle!: () => void
    vi.mocked(toggleListItem).mockReturnValue(new Promise<void>((r) => { settle = r }))
    const { rerender } = render(<ShoppingRunClient {...baseProps()} />)

    fireEvent.click(screen.getByRole('button', { name: /Show per-job breakdown for Milk/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milk for Wedding' }))
    expect(screen.getByRole('checkbox', { name: 'Milk for Wedding' })).toHaveAttribute('aria-checked', 'true')

    // The navigation's server read raced ahead of the still-in-flight write:
    // fresh pairs say unchecked, but the operator's tap is the newer intent
    // and re-lands last on the server — the display must keep it.
    rerender(<ShoppingRunClient {...baseProps({ pairs: [mkPair('e1', 'Wedding', [milk(false)])] })} />)
    expect(screen.getByRole('checkbox', { name: 'Milk for Wedding' })).toHaveAttribute('aria-checked', 'true')
    settle()
  })

  it('prunes failed-write flags for jobs that leave the scope — the header never points at nothing', async () => {
    vi.mocked(toggleListItem).mockRejectedValue(new Error('offline'))
    const twoJobs = {
      jobs: [mkJob('e1', 'Wedding'), mkJob('e2', 'Corporate')],
      pairs: [mkPair('e1', 'Wedding', [milk(false)]), mkPair('e2', 'Corporate', [milk(false)])],
    }
    const { rerender } = render(<ShoppingRunClient {...baseProps(twoJobs)} />)

    fireEvent.click(screen.getByRole('button', { name: /Show per-job breakdown for Milk/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milk for Wedding' }))
    await screen.findByText('1 not saved — retry below')

    // Wedding leaves the window (?exclude= / ?days= navigation): its failed
    // flag can no longer render a retry row, so the counter must not keep
    // claiming "retry below" with nothing below.
    rerender(<ShoppingRunClient {...baseProps({
      jobs: [mkJob('e2', 'Corporate')],
      pairs: [mkPair('e2', 'Corporate', [milk(false)])],
    })} />)
    expect(screen.queryByText(/not saved — retry below/)).not.toBeInTheDocument()
  })
})

describe('ShoppingRunClient — per-row bulk failures', () => {
  it("a later bulk keeps an earlier bulk's failure visible (per-row state, not one global slot)", async () => {
    vi.mocked(bulkSetRunChecked)
      .mockRejectedValueOnce(new Error('tx failed'))
      .mockResolvedValue(undefined)
    const props = baseProps({ pairs: [mkPair('e1', 'Wedding', [milk(false), cups(false)])] })
    render(<ShoppingRunClient {...props} />)

    // Row A's check-all fails: visible failure + retry, optimistic display kept.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
    await screen.findByText("Didn't save across the job")
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'true')

    // Mo keeps shopping: row B's check-all succeeds — routine, not an edge.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cups' }))
    await waitFor(() => expect(bulkSetRunChecked).toHaveBeenCalledTimes(2))

    // Row A still displays optimistic state, so its failure must still show.
    expect(screen.getAllByText("Didn't save across the job")).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'true')
  })

  it('retrying the failed row clears only that row and re-sends the state shown on it', async () => {
    vi.mocked(bulkSetRunChecked)
      .mockRejectedValueOnce(new Error('tx failed'))
      .mockResolvedValue(undefined)
    render(<ShoppingRunClient {...baseProps({ pairs: [mkPair('e1', 'Wedding', [milk(false)])] })} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
    await screen.findByText("Didn't save across the job")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText("Didn't save across the job")).not.toBeInTheDocument())
    // Retry re-sent the displayed (checked) intent.
    expect(vi.mocked(bulkSetRunChecked).mock.calls[1][2]).toBe(true)
  })
})

describe('ShoppingRunClient — exclusions ride the URL through window changes', () => {
  it('serializes the server-carried exclude list into every scope link, out-of-window ids included', () => {
    // 'far-job' was excluded in the 14-day view and sits outside the current
    // window (no chip renders for it) — narrowing must carry it, not drop it.
    render(<ShoppingRunClient {...baseProps({ excludedIds: ['far-job'] })} />)

    // Window toggles are kit Buttons rendering <Link> (role="button" on the anchor).
    expect(screen.getByRole('button', { name: '3 days' }))
      .toHaveAttribute('href', '/acme/shopping-run?days=3&exclude=far-job')
    expect(screen.getByRole('button', { name: '14 days' }))
      .toHaveAttribute('href', '/acme/shopping-run?days=14&exclude=far-job')
    // A chip toggle UNIONS with the carried list instead of re-deriving it
    // from in-window jobs (days=7 is the default, so it stays out of the URL).
    expect(screen.getByRole('link', { name: 'Exclude Wedding from the run' }))
      .toHaveAttribute('href', '/acme/shopping-run?exclude=far-job%2Ce1')
  })
})
