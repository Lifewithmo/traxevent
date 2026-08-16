import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { COPIED_RESET_MS, LeadProposalsClient } from '@/components/admin/LeadProposalsClient'
import type { Proposal, ProposalStatus } from '@/lib/types'

const writeText = vi.fn().mockResolvedValue(undefined)

// userEvent.setup() installs its own navigator.clipboard stub, so this has to
// be re-applied after setup() in any test that drives the copy button.
function stubClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

beforeEach(() => {
  writeText.mockClear()
  stubClipboard()
})

function proposal(over: Partial<Proposal> & Pick<Proposal, 'id' | 'status'>): Proposal {
  return {
    org_id: 'o1',
    lead_id: 'l1',
    token: `tok-${over.id}`,
    title: 'Wedding package',
    line_items: [{ description: 'Bar service', quantity: 1, unit_price: 100 }],
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as Proposal
}

const base = { orgId: 'o1', orgSlug: 'acme', leadId: 'l1' }

// Both copy buttons in a multi-row render share an accessible name until one is
// clicked, so match either label and index by DOM (= proposal) order.
function copyButtons(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /^(Copy client link|Copied!)$/ })
}

describe('LeadProposalsClient', () => {
  it('spreads the five statuses across four tones, with rejected and voided sharing alert', () => {
    const statuses: ProposalStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'voided']
    render(
      <LeadProposalsClient
        {...base}
        proposals={statuses.map((status) => proposal({ id: status, status, title: `P ${status}` }))}
      />,
    )

    const labels = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Voided']
    const classes = labels.map((label) => screen.getByText(label).className)

    // The real invariant. StatusPill only owns four tones and
    // PROPOSAL_STATUS_TONE maps BOTH `rejected` and `voided` to `alert`, so
    // five statuses can only ever yield four distinct pill classNames. A
    // regression that collapsed sent/rejected/voided back to `neutral` would
    // drop this count, which comparing accepted-vs-draft alone would miss.
    expect(new Set(classes).size).toBe(4)

    const tone = Object.fromEntries(labels.map((label, i) => [label, classes[i]]))
    expect(tone.Draft).toContain('var(--status-neutral-bg)')
    expect(tone.Sent).toContain('var(--status-pending-bg)')
    expect(tone.Accepted).toContain('var(--status-confirmed-bg)')
    expect(tone.Rejected).toContain('var(--status-alert-bg)')
    expect(tone.Voided).toEqual(tone.Rejected)
  })

  it('shows the kit empty state with a New proposal link when there are no proposals', () => {
    render(<LeadProposalsClient {...base} proposals={[]} />)

    expect(screen.getByText('No proposals yet')).toBeInTheDocument()
    expect(screen.getByText('Draft one to send this client pricing.')).toBeInTheDocument()

    const links = screen.getAllByRole('link', { name: 'New proposal' })
    expect(links).toHaveLength(2) // header CTA + empty-state CTA
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/acme/leads/l1/proposals/new')
      // Base UI merges type="button" onto the rendered element while
      // `nativeButton` is true — and `type` on an anchor is a MIME hint, not a
      // button type. Finding it here means nativeButton={false} was dropped.
      expect(link).not.toHaveAttribute('type')
    }
  })

  it('offers Copy client link for a sent proposal but not for a draft', () => {
    const { unmount } = render(
      <LeadProposalsClient {...base} proposals={[proposal({ id: 'p1', status: 'sent' })]} />,
    )
    expect(screen.getByRole('button', { name: 'Copy client link' })).toBeInTheDocument()
    unmount()

    render(<LeadProposalsClient {...base} proposals={[proposal({ id: 'p2', status: 'draft' })]} />)
    expect(screen.queryByRole('button', { name: 'Copy client link' })).not.toBeInTheDocument()
  })

  it('copies the public proposal URL and acknowledges with Copied!', async () => {
    const user = userEvent.setup()
    stubClipboard()
    render(
      <LeadProposalsClient {...base} proposals={[proposal({ id: 'p1', status: 'sent', token: 'tok-abc' })]} />,
    )

    await user.click(screen.getByRole('button', { name: 'Copy client link' }))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/proposals/tok-abc`)
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })

  it('surfaces a clipboard failure in the live region and never claims success', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'))
    const user = userEvent.setup()
    stubClipboard()
    render(
      <LeadProposalsClient {...base} proposals={[proposal({ id: 'p1', status: 'sent', token: 'tok-abc' })]} />,
    )

    await user.click(screen.getByRole('button', { name: 'Copy client link' }))

    const message = await screen.findByText('Could not copy link.')
    // The message has to land inside the polite live region, or a screen
    // reader user gets no notice that the copy failed at all.
    expect(message.closest('[aria-live="polite"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Copied!' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy client link' })).toBeInTheDocument()
  })

  it('reverts Copied! to the resting label after the acknowledgement window', async () => {
    // fireEvent, not userEvent: userEvent's own internal timers deadlock
    // against vi.useFakeTimers() here, and the assertion is about the
    // component's setTimeout, not about pointer-event fidelity.
    vi.useFakeTimers()
    try {
      render(
        <LeadProposalsClient {...base} proposals={[proposal({ id: 'p1', status: 'sent', token: 'tok-abc' })]} />,
      )

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy client link' }))
      })
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(COPIED_RESET_MS)
      })
      expect(screen.getByRole('button', { name: 'Copy client link' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not let the first row’s stale timer cancel a later row’s Copied!', async () => {
    // `copied` is a single slot shared by every row, so a second copy has to
    // restart the clock rather than inherit the first row's deadline. Without
    // the stored-and-cleared timer ref, row A's original timeout still fires
    // mid-acknowledgement and blanks row B's label early.
    vi.useFakeTimers()
    try {
      render(
        <LeadProposalsClient
          {...base}
          proposals={[
            proposal({ id: 'a', status: 'sent', token: 'tok-a', title: 'P A' }),
            proposal({ id: 'b', status: 'sent', token: 'tok-b', title: 'P B' }),
          ]}
        />,
      )

      await act(async () => {
        fireEvent.click(copyButtons()[0])
      })
      expect(copyButtons()[0]).toHaveTextContent('Copied!')

      // Three quarters of the way through row A's window.
      await act(async () => {
        vi.advanceTimersByTime(COPIED_RESET_MS * 0.75)
      })
      await act(async () => {
        fireEvent.click(copyButtons()[1])
      })
      expect(copyButtons()[1]).toHaveTextContent('Copied!')

      // Past row A's original deadline but well inside row B's fresh one.
      await act(async () => {
        vi.advanceTimersByTime(COPIED_RESET_MS * 0.5)
      })
      expect(copyButtons()[1]).toHaveTextContent('Copied!')
      expect(copyButtons()[0]).toHaveTextContent('Copy client link')
    } finally {
      vi.useRealTimers()
    }
  })

  it('schedules no orphan timer when the panel unmounts mid-copy', async () => {
    // The reset timer is only installed after the clipboard promise settles,
    // so unmount cleanup can run while there is nothing yet to clear.
    // TasksAndDocuments mounts this panel behind `{selected === 'proposal'}`,
    // and picking another attachment chip mid-await is exactly that window.
    vi.useFakeTimers()
    let release: () => void = () => {}
    writeText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    // React and jsdom keep timers of their own pending, so count only the
    // component's own reset timer, identified by its delay.
    const scheduleSpy = vi.spyOn(globalThis, 'setTimeout')
    const resetTimers = () =>
      scheduleSpy.mock.calls.filter((call) => call[1] === COPIED_RESET_MS).length
    try {
      const { unmount } = render(
        <LeadProposalsClient {...base} proposals={[proposal({ id: 'p1', status: 'sent' })]} />,
      )

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy client link' }))
      })
      // Clipboard still pending, so cleanup will find nothing to clear.
      expect(resetTimers()).toBe(0)

      unmount()
      await act(async () => {
        release()
      })

      // The continuation ran after unmount; it must not have scheduled.
      expect(resetTimers()).toBe(0)
    } finally {
      scheduleSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('formats the amount with thousands separators', () => {
    render(
      <LeadProposalsClient
        {...base}
        proposals={[
          proposal({
            id: 'p1',
            status: 'accepted',
            line_items: [{ description: 'Full service', quantity: 1, unit_price: 12345 }],
          }),
        ]}
      />,
    )

    expect(screen.getByText('$12,345')).toBeInTheDocument()
  })

  it('shows both cents on a non-integer amount', () => {
    // A bare toLocaleString() defaults to a 0 minimum / 3 maximum fraction
    // digits, so $1,234.50 rendered as "$1,234.5" — invisible to a
    // whole-dollar fixture, which is why the shared formatter is used.
    render(
      <LeadProposalsClient
        {...base}
        proposals={[
          proposal({
            id: 'p1',
            status: 'accepted',
            line_items: [{ description: 'Full service', quantity: 1, unit_price: 1234.5 }],
          }),
        ]}
      />,
    )

    expect(screen.getByText('$1,234.50')).toBeInTheDocument()
  })

  it('links each row to its editor, as a link rather than an ARIA button', () => {
    render(<LeadProposalsClient {...base} proposals={[proposal({ id: 'p9', status: 'sent' })]} />)

    // getByRole('link') is the load-bearing half: nativeButton={false} makes
    // Base UI stamp role="button" on the anchor unless we override it back,
    // which would hide a plain navigation from the links rotor.
    const edit = screen.getByRole('link', { name: 'Edit' })
    expect(edit).toHaveAttribute('href', '/acme/leads/l1/proposals/p9')
    expect(edit).not.toHaveAttribute('type')
  })
})
