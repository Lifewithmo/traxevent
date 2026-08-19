import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()

/**
 * `useSearchParams` here reads the REAL jsdom URL instead of a hand-set
 * variable, because that URL is what the fix under test mutates. A mock the
 * test sets by hand could not see `window.history.replaceState` land, and a
 * remount would be handed the parameters the test wanted rather than the ones
 * the browser actually still has — which is precisely the thing being asserted.
 *
 * The result is memoised on the query string so the returned object's IDENTITY
 * is stable while the query is unchanged and changes when it changes, matching
 * Next.js. Without that, a fresh object per render would re-fire every effect
 * keyed on `searchParams` on every render, and "the composer opens exactly
 * once" would be untestable.
 */
let paramsKey: string | null = null
let paramsValue = new URLSearchParams()
function liveSearchParams() {
  if (window.location.search !== paramsKey) {
    paramsKey = window.location.search
    paramsValue = new URLSearchParams(paramsKey)
  }
  return paramsValue
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => liveSearchParams(),
}))

const markLeadLost = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/leads', () => ({
  deleteLead: vi.fn(),
  updateLead: vi.fn().mockResolvedValue(undefined),
  markLeadLost: (...a: unknown[]) => markLeadLost(...a),
  setLeadStage: vi.fn().mockResolvedValue(undefined),
  setLeadWaiting: vi.fn(),
  clearLeadWaiting: vi.fn(),
}))
vi.mock('@/actions/tasks', () => ({ createTask: vi.fn(), completeTask: vi.fn(), snoozeTask: vi.fn() }))
vi.mock('@/actions/notes', () => ({ createNote: vi.fn() }))
vi.mock('@/actions/proposals', () => ({}))
vi.mock('@/actions/invoices', () => ({ createInvoice: vi.fn(), generateFromProposal: vi.fn() }))
vi.mock('@/actions/vendors', () => ({ createVendor: vi.fn(), updateVendor: vi.fn(), deleteVendor: vi.fn() }))
vi.mock('@/actions/calendar', () => ({ listCalendarRange: vi.fn().mockResolvedValue([]) }))
vi.mock('@/actions/client-portal', () => ({ ensureClientPortalToken: vi.fn() }))

import { OpportunityDetailClient } from '@/components/admin/OpportunityDetailClient'
import type { Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Ada Wedding', stage: 'proposal', created_at: '' }
const wonLead: Lead = { ...lead, stage: 'closed_won' }

const base = {
  orgId: 'o1',
  orgSlug: 'acme',
  customer: null,
  tasks: [],
  activity: [],
  job: null,
  eventTypes: [],
  proposals: [],
  invoices: [],
  vendors: [],
  acceptedProposals: [],
  today: '2026-08-07',
  calendarItems: [],
}

/** Land on a URL the way a deep link from the pipeline does. */
function visit(url: string) {
  window.history.replaceState(null, '', url)
}

const PATH = '/acme/leads/l1'

/**
 * The one-shot deep-link parameters are COMMANDS, not state. Before this, none
 * of the three was ever stripped from the URL, so every FRESH MOUNT re-fired
 * the command it encoded — a reload, browser back/forward, a restored tab, a
 * pasted link.
 *
 * `?focus=lost` made that destructive rather than cosmetic: markLeadLost
 * (actions/leads.ts:122-140) unconditionally writes `lost: { reason, ... }` and
 * appends another 'lost' activity entry, so a second pass through the dialog on
 * an already-lost deal OVERWRITES the recorded reason and duplicates the
 * timeline entry. An operator reloading a page silently rewrote why the deal
 * died.
 */
describe('OpportunityDetailClient one-shot deep-link parameters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    visit(PATH)
  })

  describe('?focus=lost', () => {
    it('opens the mark-lost dialog on arrival and takes the parameter off the URL', async () => {
      visit(`${PATH}?focus=lost`)
      render(<OpportunityDetailClient {...base} lead={lead} />)

      await screen.findByRole('dialog', { name: /mark lost/i })
      expect(window.location.pathname).toBe(PATH)
      expect(window.location.search).toBe('')
    })

    // THE DEFECT. Not a re-render — a fresh mount, which is what a reload,
    // back/forward, a restored tab or a pasted link produces.
    it('does not re-open the destructive dialog when the page is reloaded', async () => {
      visit(`${PATH}?focus=lost`)
      const first = render(<OpportunityDetailClient {...base} lead={lead} />)
      await screen.findByRole('dialog', { name: /mark lost/i })
      first.unmount()

      // The reload: a brand-new mount against whatever URL the browser is on now.
      render(<OpportunityDetailClient {...base} lead={lead} />)
      // `hidden: true` so this settle step still finds the page when a dialog IS
      // open — an open dialog aria-hides the tree behind it, and a settle that
      // the failure itself defeats reports the wrong error.
      await screen.findByRole('heading', { name: 'Ada Wedding', hidden: true })
      expect(screen.queryByRole('dialog', { name: /mark lost/i })).toBeNull()
      expect(markLeadLost).not.toHaveBeenCalled()
    })
  })

  describe('?convert=1', () => {
    it('opens the scheduler on arrival and takes the parameter off the URL', async () => {
      visit(`${PATH}?convert=1`)
      render(<OpportunityDetailClient {...base} lead={wonLead} />)

      expect(await screen.findByLabelText('Job name')).toBeInTheDocument()
      expect(window.location.search).toBe('')
    })

    it('does not re-open the scheduler when the page is reloaded', async () => {
      visit(`${PATH}?convert=1`)
      const first = render(<OpportunityDetailClient {...base} lead={wonLead} />)
      expect(await screen.findByLabelText('Job name')).toBeInTheDocument()
      first.unmount()

      render(<OpportunityDetailClient {...base} lead={wonLead} />)
      await screen.findByRole('heading', { name: 'Ada Wedding', hidden: true })
      expect(screen.queryByLabelText('Job name')).toBeNull()
    })
  })

  describe('?focus=task', () => {
    it('opens the composer on arrival and takes the parameter off the URL', () => {
      visit(`${PATH}?focus=task`)
      render(<OpportunityDetailClient {...base} lead={lead} />)

      expect(screen.getByPlaceholderText(/add a task/i)).toHaveFocus()
      expect(window.location.search).toBe('')
    })

    it('does not re-open the composer when the page is reloaded', () => {
      visit(`${PATH}?focus=task`)
      const first = render(<OpportunityDetailClient {...base} lead={lead} />)
      expect(screen.getByPlaceholderText(/add a task/i)).toHaveFocus()
      first.unmount()

      render(<OpportunityDetailClient {...base} lead={lead} />)
      expect(screen.queryByPlaceholderText(/add a task/i)).toBeNull()
    })

    /**
     * Effect ORDER. The composer effect is keyed on `searchParams`, and the
     * strip CHANGES `searchParams` — so that effect necessarily runs a second
     * time with the parameter gone. It must be a no-op then: openComposer()
     * steals focus back, so a second fire is detectable by moving focus away
     * and re-rendering. The typed draft would also be lost if the panel were
     * re-mounted rather than merely re-focused.
     */
    it('opens the composer exactly once — the re-render the strip causes is a no-op', () => {
      visit(`${PATH}?focus=task`)
      const { rerender } = render(<OpportunityDetailClient {...base} lead={lead} />)
      const input = screen.getByPlaceholderText(/add a task/i)
      fireEvent.change(input, { target: { value: 'Call the venue' } })

      // The operator tabs away, then anything re-renders the tree (the router
      // state update replaceState causes, a router.refresh(), a parent update).
      // `searchParams` is a different object now: '?focus=task' -> ''.
      input.blur()
      expect(input).not.toHaveFocus()
      const paramsAtMount = paramsValue
      rerender(<OpportunityDetailClient {...base} lead={lead} />)
      expect(liveSearchParams()).not.toBe(paramsAtMount)

      expect(screen.getByPlaceholderText(/add a task/i)).toHaveValue('Call the venue')
      expect(screen.getByPlaceholderText(/add a task/i)).not.toHaveFocus()
    })
  })

  describe('what it leaves alone', () => {
    it('keeps unrelated parameters and the hash, stripping only what it consumed', async () => {
      visit(`${PATH}?tab=vendors&focus=lost&sort=due#proposals`)
      render(<OpportunityDetailClient {...base} lead={lead} />)

      await screen.findByRole('dialog', { name: /mark lost/i })
      expect(window.location.pathname).toBe(PATH)
      expect(new URLSearchParams(window.location.search).get('tab')).toBe('vendors')
      expect(new URLSearchParams(window.location.search).get('sort')).toBe('due')
      expect(new URLSearchParams(window.location.search).has('focus')).toBe(false)
      expect(window.location.hash).toBe('#proposals')
    })

    it('leaves a focus value it never acted on, and rewrites nothing', () => {
      visit(`${PATH}?focus=notes&convert=0`)
      render(<OpportunityDetailClient {...base} lead={lead} />)

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(window.location.search).toBe('?focus=notes&convert=0')
    })
  })

  // The latches are useState, not values derived from searchParams: a derived
  // value would slam the dialog back open on the next render, and every
  // router.refresh() triggers one. Stripping the parameter must not have
  // quietly turned the dialog into something the URL can no longer hold open.
  it('keeps the mark-lost dialog open across a re-render before it is answered', async () => {
    visit(`${PATH}?focus=lost`)
    const { rerender } = render(<OpportunityDetailClient {...base} lead={lead} />)
    await screen.findByRole('dialog', { name: /mark lost/i })

    rerender(<OpportunityDetailClient {...base} lead={lead} />)
    const dialog = await screen.findByRole('dialog', { name: /mark lost/i })
    expect(within(dialog).getByText(/lost reasons/i)).toBeInTheDocument()
  })
})
