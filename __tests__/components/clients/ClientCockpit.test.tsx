import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ClientCockpit } from '@/components/admin/clients/ClientCockpit'
import { getBookabilityCtx } from '@/actions/bookability'
import type { Lead } from '@/lib/types'

const refresh = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
// 'use server' modules pull in firebase-admin at module scope — mocked like
// ClientWorkingRail.test.tsx mocks '@/actions/customers'.
vi.mock('@/actions/customers', () => ({ updateCustomer: vi.fn() }))
vi.mock('@/actions/proposals', () => ({ listProposals: vi.fn().mockResolvedValue([]) }))
vi.mock('@/actions/notes', () => ({ createNote: vi.fn() }))
vi.mock('@/actions/activity', () => ({ logContactActivity: vi.fn() }))
vi.mock('@/actions/proposal-rebook', () => ({ createProposalFromLastAccepted: vi.fn() }))
vi.mock('@/actions/bookability', () => ({ getBookabilityCtx: vi.fn().mockResolvedValue(null) }))

/*
  THE FORM IS A CONTRACT, NOT A DEPENDENCY (New Opportunity inc 1). Agent F owns
  NewOpportunityForm; the cockpit builds against contract C5 only, so the form
  is mocked and these tests assert the props the cockpit threads — customer
  pinned, lazy ctx loader, initialValues from the last job — and that the WHOLE
  PAGE mounts exactly one instance (the rail lost its private copy; two
  instances meant duplicate ids on one page).
*/
const { formProps } = vi.hoisted(() => ({ formProps: vi.fn() }))
vi.mock('@/components/admin/pipeline/NewOpportunityForm', () => ({
  NewOpportunityForm: (props: Record<string, unknown>) => {
    formProps(props)
    return (
      <div data-mock-form>
        {props.open ? (
          <div role="dialog" aria-label="New opportunity">
            <button
              type="button"
              onClick={() => (props.onCreated as ((l: unknown, info: { stayedOpen: boolean }) => void) | undefined)?.({
                id: 'new1', name: 'Jane Doe', stage: 'inquiry',
                created_at: 't', updated_at: 't',
              }, { stayedOpen: false })}
            >
              mock-create
            </button>
            <button
              type="button"
              onClick={() => (props.onCreated as ((l: unknown, info: { stayedOpen: boolean }) => void) | undefined)?.({
                id: 'new2', name: 'Jane Doe', stage: 'inquiry',
                created_at: 't', updated_at: 't',
              }, { stayedOpen: true })}
            >
              mock-create-another
            </button>
          </div>
        ) : null}
      </div>
    )
  },
}))

const opp = (over: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Tessa Lund', stage: 'closed_won', created_at: '2026-01-01T00:00:00.000Z',
  updated_at: 't', ...over,
} as Lead)

const baseProps = {
  orgId: 'o',
  orgSlug: 'acme',
  customer: { id: 'c1', name: 'Tessa Lund', created_at: 't' } as never,
  opportunities: [] as Lead[],
  notes: [],
  invoices: [],
  activity: [],
  ar: { invoiced: 0, paid: 0, outstanding: 0, overdueAmount: 0, openCount: 0 },
}

describe('ClientCockpit (New Opportunity inc 1 — one form instance, contract C5)', () => {
  beforeEach(() => {
    formProps.mockClear()
    vi.mocked(getBookabilityCtx).mockClear()
  })
  afterEach(cleanup)

  it('mounts exactly ONE form instance for the whole page, which the rail merely triggers', () => {
    render(<ClientCockpit {...baseProps} />)
    expect(document.querySelectorAll('[data-mock-form]')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    // The rail's empty-Jobs CTA opens the cockpit's instance.
    fireEvent.click(screen.getByRole('button', { name: 'Book a job' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const props = formProps.mock.calls.at(-1)![0]
    expect(props.open).toBe(true)
    expect(props.customer).toMatchObject({ id: 'c1', name: 'Tessa Lund' })
  })

  it('threads the C5 props: orgSlug, showDeliveryMode, the profile array and the lazy ctx loader', async () => {
    render(<ClientCockpit {...baseProps}
      showDeliveryMode
      eventTypeProfiles={[{ id: 'p-wed', name: 'Wedding', needsMobile: true, needsVenue: true }]}
      canCreateEventTypes
      resourceLabels={{ mobile: { one: 'cart', many: 'carts' } }}
      opportunities={[
        opp({ id: 'a', created_at: '2025-05-01T00:00:00.000Z' }),
        opp({ id: 'b', created_at: '2026-02-01T00:00:00.000Z' }),
      ]}
    />)
    const props = formProps.mock.calls.at(-1)![0]
    expect(props).toMatchObject({
      orgId: 'o', orgSlug: 'acme', open: false,
      showDeliveryMode: true,
      // Event types inc 1: the org profile array, the owner/admin
      // inline-create gate, and the operator's kind words ride through
      // untouched — and the pinned customer's own history IS their
      // past-job count.
      eventTypeProfiles: [{ id: 'p-wed', name: 'Wedding', needsMobile: true, needsVenue: true }],
      canCreateEventTypes: true,
      resourceLabels: { mobile: { one: 'cart', many: 'carts' } },
      pastJobCounts: { c1: 2 },
    })
    // Lazy, not preloaded: the cockpit hands a LOADER (contract C3 via C5's
    // loadBookabilityCtx) so most visits — which never open the form — pay
    // zero ctx reads. SLUG-ONLY by C5b: the action resolves the org from the
    // slug and asserts membership on the RESOLVED id (the old (orgId, slug)
    // pair was a cross-tenant read).
    expect(props.bookabilityCtx).toBeUndefined()
    await (props.loadBookabilityCtx as () => Promise<unknown>)()
    expect(getBookabilityCtx).toHaveBeenCalledWith('acme')
  })

  it('prefills initialValues from the customer’s MOST RECENT opportunity', () => {
    render(<ClientCockpit {...baseProps} opportunities={[
      opp({ id: 'old', created_at: '2025-05-01T00:00:00.000Z', event_type: 'Corporate', guest_count: 40 }),
      opp({ id: 'newer', created_at: '2026-02-01T00:00:00.000Z', event_type: 'Wedding', guest_count: 120 }),
    ]} />)
    const props = formProps.mock.calls.at(-1)![0]
    expect(props.initialValues).toEqual({ event_type: 'Wedding', guest_count: 120 })
  })

  it('passes no initialValues for a client with no jobs yet', () => {
    render(<ClientCockpit {...baseProps} />)
    expect(formProps.mock.calls.at(-1)![0].initialValues).toBeUndefined()
  })

  it('shows the "Job created for {customer}" toast with a link to the new job after a create', () => {
    render(<ClientCockpit {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Book a job' }))
    fireEvent.click(screen.getByRole('button', { name: 'mock-create' }))
    const toast = screen.getByRole('status')
    expect(toast.textContent).toContain('Job created for Tessa Lund')
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/acme/leads/new1')
  })

  /*
    C5b: on save-and-create-another the dialog STAYS OPEN, so the toast would
    render under its backdrop — the form announces that create in its own
    aria-live region instead, and the cockpit stays quiet.
  */
  it('suppresses the toast on the save-and-create-another path', () => {
    render(<ClientCockpit {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Book a job' }))
    fireEvent.click(screen.getByRole('button', { name: 'mock-create-another' }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
