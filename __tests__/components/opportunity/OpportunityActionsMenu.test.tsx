import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const { setLeadStage, deleteLead, markLeadLost, setLeadWaiting, ensureClientPortalToken } = vi.hoisted(() => ({
  setLeadStage: vi.fn(),
  deleteLead: vi.fn(),
  markLeadLost: vi.fn(),
  setLeadWaiting: vi.fn(),
  ensureClientPortalToken: vi.fn(),
}))
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/actions/leads', () => ({ setLeadStage, deleteLead, markLeadLost, setLeadWaiting }))
vi.mock('@/actions/client-portal', () => ({ ensureClientPortalToken }))

import { OpportunityActionsMenu } from '@/components/admin/opportunity/OpportunityActionsMenu'
import type { Lead } from '@/lib/types'

const lead: Lead = { id: 'l1', name: 'Ada Wedding', stage: 'proposal', created_at: '' }

function mount(over: Partial<Lead> = {}) {
  const onWon = vi.fn()
  const onDone = vi.fn()
  render(
    <OpportunityActionsMenu orgId="o1" orgSlug="acme" lead={{ ...lead, ...over }} onWon={onWon} onDone={onDone} />
  )
  return { onWon, onDone }
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
}

function closeMenu() {
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
}

beforeEach(() => {
  vi.clearAllMocks()
  setLeadStage.mockResolvedValue(undefined)
  deleteLead.mockResolvedValue(undefined)
  markLeadLost.mockResolvedValue(undefined)
  setLeadWaiting.mockResolvedValue(undefined)
  ensureClientPortalToken.mockResolvedValue('portal_tok')
})

describe('OpportunityActionsMenu', () => {
  it('reaches every action from one menu', () => {
    mount()
    openMenu()
    for (const name of [
      'Inquiry',
      'Consultation',
      'Proposal',
      'Closed Won',
      /Mark lost/,
      /Mark as waiting/,
      'Copy portal link',
      'Delete',
    ]) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('does not offer Closed Lost — losing must capture a reason', () => {
    mount()
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Closed Lost' })).toBeNull()
  })

  it('disables the stage the opportunity is already in', () => {
    mount()
    openMenu()
    expect(screen.getByRole('menuitem', { name: 'Proposal' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'Consultation' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('moves the stage and refreshes, without claiming a win', async () => {
    const { onWon } = mount()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Consultation' }))
    await waitFor(() => expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'consultation'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(onWon).not.toHaveBeenCalled()
  })

  it('winning also fires onWon so the scheduler can open', async () => {
    const { onWon } = mount()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Closed Won' }))
    await waitFor(() => expect(setLeadStage).toHaveBeenCalledWith('o1', 'l1', 'closed_won'))
    await waitFor(() => expect(onWon).toHaveBeenCalled())
  })

  it('keeps the menu open and surfaces the error when a stage move fails', async () => {
    setLeadStage.mockRejectedValueOnce(new Error('offline'))
    mount()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Inquiry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
    expect(screen.getByRole('menuitem', { name: 'Consultation' })).toBeInTheDocument()
  })

  it('deletes through a kit dialog, never window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mount()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(deleteLead).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteLead).toHaveBeenCalledWith('o1', 'l1'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/acme/leads'))
  })

  it('names the opportunity in the delete confirmation', () => {
    mount({ id: 'l2', name: 'Dana Kim', title: 'Riverside gala' })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Riverside gala/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Dana Kim/)).toBeNull()
  })

  // `deleteLead` deletes ONE document. Tasks are a subcollection (Firestore
  // leaves those behind) and proposals/invoices are top-level collections
  // filtered by lead_id, so they all survive the delete. A dialog that promises
  // otherwise is how an operator bins a lost lead carrying a live $5,000
  // invoice believing the invoice went with it.
  it('does not promise a cascade the server does not perform', () => {
    mount({ id: 'l2', title: 'Riverside gala' })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const copy = within(screen.getByRole('dialog')).getByText(/Riverside gala/).textContent ?? ''
    expect(copy).not.toMatch(/everything attached/i)
    expect(copy).toMatch(/NOT deleted/)
    expect(copy).toMatch(/invoices/i)
    // The one promise that IS true of a single-document delete.
    expect(copy).toMatch(/cannot be undone/i)
  })

  it('opens the mark-lost dialog from the menu', () => {
    mount()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Mark lost/ }))
    expect(screen.getByRole('dialog', { name: 'Mark lost' })).toBeInTheDocument()
  })

  it('opens the mark-as-waiting dialog from the menu', () => {
    mount()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Mark as waiting/ }))
    expect(screen.getByRole('dialog', { name: 'Mark as waiting' })).toBeInTheDocument()
  })

  it('mints and copies the portal link, confirming in place', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    mount()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy portal link' }))
    expect(await screen.findByRole('menuitem', { name: 'Copied!' })).toBeInTheDocument()
    expect(ensureClientPortalToken).toHaveBeenCalledWith('o1', 'l1')
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/client/portal_tok'))
  })

  // "Copied!" is a one-shot acknowledgement of the click that just happened.
  // Left standing it confirms nothing, and it renames the control — the item
  // can no longer be found by the name it advertises.
  it('drops the copy confirmation when the menu is reopened', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    mount()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy portal link' }))
    expect(await screen.findByRole('menuitem', { name: 'Copied!' })).toBeInTheDocument()

    closeMenu()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    openMenu()

    expect(await screen.findByRole('menuitem', { name: 'Copy portal link' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Copied!' })).toBeNull()
  })

  it('drops a stale failure when the menu is reopened', async () => {
    setLeadStage.mockRejectedValueOnce(new Error('offline'))
    mount()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Inquiry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('offline')

    closeMenu()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    openMenu()

    expect(await screen.findByRole('menuitem', { name: 'Inquiry' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
