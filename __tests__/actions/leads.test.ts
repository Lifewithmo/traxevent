import { describe, it, expect, vi, beforeEach } from 'vitest'

const leadDocSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadDocGetSpy = vi.hoisted(() => vi.fn())
const leadDocUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const leadDocDeleteSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listLeadsSpy = vi.hoisted(() => vi.fn())
const fieldValueDeleteSentinel = vi.hoisted(() => ({ __op: 'delete' }))
const findOrCreateCustomerCore = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ customer: { id: 'default-customer-id', name: 'x', created_at: 'x' }, created: true })
)
const getCustomerCore = vi.hoisted(() => vi.fn())
// The capacity guard (setLeadStage → closed_won) loads the org, its units, and
// all leads. Default the org to a NON-business plan so the guard is a no-op for
// every pre-existing test — those assert setLeadStage's plain behavior and must
// not see the guard. The guard tests below opt in by setting a business org +
// units + leads.
const orgDocGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ exists: true, data: () => ({ id: 'org-1', plan: 'starter' }) }))
const unitsListSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
// Batch seam (New Opportunity inc 1): createLead with a follow_up_date commits
// the lead doc AND its follow-up task in one WriteBatch.
const batchSetSpy = vi.hoisted(() => vi.fn())
const batchCommitSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/firebase-admin', () => {
  const leadsCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-lead-id',
      set: leadDocSetSpy,
      get: leadDocGetSpy,
      update: leadDocUpdateSpy,
      delete: leadDocDeleteSpy,
      // tasksRef(orgId, leadId) = .../leads/{leadId}/tasks — task doc refs are
      // tagged so batch.set assertions can tell them from the lead doc ref.
      collection: vi.fn().mockImplementation((sub: string) =>
        sub === 'tasks' ? { doc: vi.fn((taskId?: string) => ({ __taskDoc: taskId })) } : {}
      ),
    })),
    orderBy: vi.fn().mockReturnValue({ get: listLeadsSpy }),
  }
  const unitsCol = {
    orderBy: vi.fn().mockReturnValue({ get: unitsListSpy }),
  }
  const orgDoc = {
    get: orgDocGetSpy,
    collection: vi.fn().mockImplementation((sub: string) => {
      if (sub === 'leads') return leadsCol
      if (sub === 'capacity_units') return unitsCol
      return {}
    }),
  }
  return {
    adminDb: {
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }),
      batch: vi.fn().mockImplementation(() => ({ set: batchSetSpy, commit: batchCommitSpy })),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin' }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin' }),
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn().mockReturnValue(fieldValueDeleteSentinel) },
}))

vi.mock('@/lib/activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/lib/crm/customers', () => ({ findOrCreateCustomerCore, getCustomerCore }))

import {
  listLeads,
  getLead,
  createLead,
  updateLead,
  setLeadStage,
  deleteLead,
} from '@/actions/leads'
import { logActivity } from '@/lib/activity'

describe('leads actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createLead writes a lead with a generated id, default stage, and created_at', async () => {
    const lead = await createLead('org-1', { name: 'Acme Wedding' })
    expect(leadDocSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme Wedding',
        stage: 'inquiry',
        created_at: expect.any(String),
      })
    )
    expect(lead.id).toBeTruthy()
    expect(lead.stage).toBe('inquiry')
    expect(lead.name).toBe('Acme Wedding')
  })

  it('createLead omits blank optionals (email/organization)', async () => {
    await createLead('org-1', { name: 'No Extras', email: '', organization: '   ' })
    const written = leadDocSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('email')
    expect(written).not.toHaveProperty('organization')
  })

  it('links a customer on create, reusing one that matches by email', async () => {
    const { assertOrgAdmin } = await import('@/lib/auth/assert')
    vi.mocked(findOrCreateCustomerCore).mockResolvedValue({
      customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' },
      created: false,
    })
    const lead = await createLead('o1', { name: 'Dana Kim', email: 'dana@riv.co', organization: 'Riverside' })
    expect(assertOrgAdmin).toHaveBeenCalledWith('o1')
    expect(findOrCreateCustomerCore).toHaveBeenCalledWith('o1', {
      name: 'Dana Kim', email: 'dana@riv.co', company: 'Riverside',
    })
    expect(lead.customer_id).toBe('c1')
  })

  it('still creates the lead when no email is supplied', async () => {
    vi.mocked(findOrCreateCustomerCore).mockResolvedValue({
      customer: { id: 'c2', name: 'Walk-in', created_at: 'x' },
      created: true,
    })
    const lead = await createLead('o1', { name: 'Walk-in' })
    expect(lead.customer_id).toBe('c2')
  })

  it('persists a title when one is supplied', async () => {
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
    const lead = await createLead('o1', { name: 'Dana Kim', title: '  Riverside gala  ' })
    expect(lead.title).toBe('Riverside gala')
  })

  it('omits title entirely when blank', async () => {
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
    const lead = await createLead('o1', { name: 'Dana Kim', title: '   ' })
    expect('title' in lead).toBe(false)
  })

  it('createLead persists delivery_mode when supplied', async () => {
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
    const lead = await createLead('o1', { name: 'Dana Kim', delivery_mode: 'onsite' })
    expect(leadDocSetSpy).toHaveBeenCalledWith(expect.objectContaining({ delivery_mode: 'onsite' }))
    expect(lead.delivery_mode).toBe('onsite')
  })

  it('createLead omits delivery_mode entirely when not supplied', async () => {
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
    await createLead('o1', { name: 'Dana Kim' })
    expect(leadDocSetSpy.mock.calls[0][0]).not.toHaveProperty('delivery_mode')
  })

  it('updateLead persists a delivery_mode change', async () => {
    await updateLead('org-1', 'l1', { delivery_mode: 'onsite' })
    expect(leadDocUpdateSpy.mock.calls[0][0].delivery_mode).toBe('onsite')
  })

  it('createLead persists assigned_units when supplied', async () => {
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
    const lead = await createLead('o1', { name: 'Dana Kim', assigned_units: { mobile: 'k1' } })
    expect(leadDocSetSpy).toHaveBeenCalledWith(expect.objectContaining({ assigned_units: { mobile: 'k1' } }))
    expect(lead.assigned_units).toEqual({ mobile: 'k1' })
  })

  it('createLead omits assigned_units entirely when not supplied', async () => {
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true })
    await createLead('o1', { name: 'Dana Kim' })
    expect(leadDocSetSpy.mock.calls[0][0]).not.toHaveProperty('assigned_units')
  })

  it('updateLead persists an assigned_units change', async () => {
    await updateLead('org-1', 'l1', { assigned_units: { mobile: 'k2' } })
    expect(leadDocUpdateSpy.mock.calls[0][0].assigned_units).toEqual({ mobile: 'k2' })
  })

  it('createLead rejects a blank name with the shared-validator message and does not write', async () => {
    // The message comes from lib/crm/validate — the one rule set intake and
    // the operator path share (it kept intake's historical strings).
    await expect(createLead('org-1', { name: '   ' })).rejects.toThrow('Please enter your name.')
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('createLead throws "Invalid stage" for a bad stage and does not write', async () => {
    await expect(
      // @ts-expect-error testing invalid stage at runtime
      createLead('org-1', { name: 'Bad Stage', stage: 'nope' })
    ).rejects.toThrow('Invalid stage')
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('listLeads orders by created_at desc and returns mapped docs', async () => {
    listLeadsSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'l1', name: 'A', stage: 'inquiry', created_at: 'x' }) }],
    })
    const list = await listLeads('org-1')
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('A')
  })

  it('getLead returns null when the doc does not exist', async () => {
    leadDocGetSpy.mockResolvedValue({ exists: false })
    const lead = await getLead('org-1', 'missing')
    expect(lead).toBeNull()
  })

  it('getLead returns the lead data when it exists', async () => {
    leadDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'l1', name: 'A', stage: 'inquiry', created_at: 'x' }),
    })
    const lead = await getLead('org-1', 'l1')
    expect(lead).not.toBeNull()
    expect(lead?.name).toBe('A')
  })

  it('updateLead skips undefined, maps null to FieldValue.delete, and always sets updated_at', async () => {
    await updateLead('org-1', 'l1', {
      name: 'New',
      // email cleared via null → FieldValue.delete() at runtime
      email: null,
      phone: undefined,
    })
    const written = leadDocUpdateSpy.mock.calls[0][0]
    expect(written.name).toBe('New')
    expect(written.email).toBe(fieldValueDeleteSentinel)
    expect(written).not.toHaveProperty('phone')
    expect(written.updated_at).toEqual(expect.any(String))
  })

  it('updateLead throws "Invalid stage" for a bad stage and does not write', async () => {
    await expect(
      // @ts-expect-error testing invalid stage at runtime
      updateLead('org-1', 'l1', { stage: 'nope' })
    ).rejects.toThrow('Invalid stage')
    expect(leadDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('updateLead logs a stage ActivityEvent when the stage actually changes', async () => {
    leadDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'l1', name: 'X', stage: 'inquiry', created_at: '' }),
    })
    await updateLead('org-1', 'l1', { stage: 'proposal' })
    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(logActivity).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        parent_type: 'opportunity',
        parent_id: 'l1',
        kind: 'stage',
        summary: 'Stage → proposal',
      })
    )
  })

  it('updateLead does not log when the stage is unchanged', async () => {
    leadDocGetSpy.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'l1', name: 'X', stage: 'inquiry', created_at: '' }),
    })
    await updateLead('org-1', 'l1', { stage: 'inquiry' })
    expect(logActivity).not.toHaveBeenCalled()
  })

  it('updateLead does not log for a non-stage update', async () => {
    await updateLead('org-1', 'l1', { notes: 'x' })
    expect(logActivity).not.toHaveBeenCalled()
  })

  it('setLeadStage throws "Invalid stage" for a bad stage and does not update', async () => {
    await expect(
      // @ts-expect-error testing invalid stage at runtime
      setLeadStage('org-1', 'l1', 'nope')
    ).rejects.toThrow('Invalid stage')
    expect(leadDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('setLeadStage updates stage and updated_at for a valid stage', async () => {
    await setLeadStage('org-1', 'l1', 'closed_won')
    expect(leadDocUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'closed_won', updated_at: expect.any(String) })
    )
  })

  it('deleteLead calls .delete()', async () => {
    await deleteLead('org-1', 'l1')
    expect(leadDocDeleteSpy).toHaveBeenCalled()
  })
})

/*
  Server-side capacity guard (increment 4). On a transition INTO closed_won, a
  business-tier org with ≥1 unit is protected: winning a job that would put its
  date over capacity, or that double-books its assigned unit, RETURNS a refusal
  result `{ ok: false, guard }` — UNLESS { override: true } is passed, in which
  case it writes and returns `{ ok: true }`. This supersedes the Inc-2
  client-side pre-confirm; the client checks the result and confirms.

  MODELED AS A RETURN VALUE, not a thrown error, and deliberately so: Next 16's
  RSC flight layer redacts thrown Server Action errors in a production build
  (the client receives only a generic { digest } Error — message/name/code all
  stripped), so a thrown guard could not be detected on the client in prod and
  the advisory guard silently became an unconditional hard block. Return values
  serialize intact in both dev and prod.
*/
describe('setLeadStage capacity guard (increment 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Defaults are re-established per test since clearAllMocks wipes call data
    // but not implementations; guard tests set their own org/units/leads.
    orgDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'org-1', plan: 'business' }) })
    unitsListSpy.mockResolvedValue({ docs: [
      { data: () => ({ id: 'k1', name: 'Kart 1', kind: 'mobile', active: true, blockouts: [] }) },
    ] })
    // The lead being won (loaded by setLeadStage's own doc().get()).
    leadDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 'win', stage: 'proposal', event_date: '2026-09-30', assigned_units: { mobile: 'k1' }, created_at: 'x',
    }) })
  })

  const wonOnDate = { data: () => ({ id: 'won1', stage: 'closed_won', event_date: '2026-09-30', assigned_units: { mobile: 'k1' }, created_at: 'x' }) }
  const winLeadDoc = { data: () => ({ id: 'win', stage: 'proposal', event_date: '2026-09-30', assigned_units: { mobile: 'k1' }, created_at: 'x' }) }

  it('returns { ok:false, guard } when winning would exceed capacity (no override)', async () => {
    // One mobile unit; a won job already holds the date. Winning this one makes
    // mobile demand 2 > supply 1 → over capacity.
    listLeadsSpy.mockResolvedValue({ docs: [wonOnDate, winLeadDoc] })
    const result = await setLeadStage('org-1', 'win', 'closed_won')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.guard).toBeTruthy()
    expect(leadDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('returns { ok:false, guard } when the assigned unit clashes (no override)', async () => {
    // Two units so capacity is not exceeded, but both leads pin k1 → clash.
    unitsListSpy.mockResolvedValue({ docs: [
      { data: () => ({ id: 'k1', name: 'Kart 1', kind: 'mobile', active: true, blockouts: [] }) },
      { data: () => ({ id: 'k2', name: 'Kart 2', kind: 'mobile', active: true, blockouts: [] }) },
    ] })
    listLeadsSpy.mockResolvedValue({ docs: [wonOnDate, winLeadDoc] })
    const result = await setLeadStage('org-1', 'win', 'closed_won')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.guard).toMatch(/booked/i)
    expect(leadDocUpdateSpy).not.toHaveBeenCalled()
  })

  it('proceeds (writes, returns { ok:true }) when override is passed even over capacity', async () => {
    listLeadsSpy.mockResolvedValue({ docs: [wonOnDate, winLeadDoc] })
    const result = await setLeadStage('org-1', 'win', 'closed_won', { override: true })
    expect(result).toEqual({ ok: true })
    expect(leadDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
  })

  it('does not guard a standard (non-business) org', async () => {
    orgDocGetSpy.mockResolvedValue({ exists: true, data: () => ({ id: 'org-1', plan: 'starter' }) })
    listLeadsSpy.mockResolvedValue({ docs: [wonOnDate, winLeadDoc] })
    const result = await setLeadStage('org-1', 'win', 'closed_won')
    expect(result).toEqual({ ok: true })
    expect(leadDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
  })

  it('does not guard a business org with no units', async () => {
    unitsListSpy.mockResolvedValue({ docs: [] })
    listLeadsSpy.mockResolvedValue({ docs: [wonOnDate, winLeadDoc] })
    const result = await setLeadStage('org-1', 'win', 'closed_won')
    expect(result).toEqual({ ok: true })
    expect(leadDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
  })

  it('does not guard a move that is not into closed_won', async () => {
    listLeadsSpy.mockResolvedValue({ docs: [wonOnDate, winLeadDoc] })
    const result = await setLeadStage('org-1', 'win', 'consultation')
    expect(result).toEqual({ ok: true })
    expect(leadDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'consultation' }))
  })

  it('does not guard a lead that is already closed_won', async () => {
    leadDocGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 'win', stage: 'closed_won', event_date: '2026-09-30', assigned_units: { mobile: 'k1' }, created_at: 'x',
    }) })
    listLeadsSpy.mockResolvedValue({ docs: [wonOnDate] })
    const result = await setLeadStage('org-1', 'win', 'closed_won')
    expect(result).toEqual({ ok: true })
    expect(leadDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
  })

  it('proceeds when winning a fresh date (not over, no clash)', async () => {
    // The only booking on this date is the lead being won.
    listLeadsSpy.mockResolvedValue({ docs: [winLeadDoc] })
    const result = await setLeadStage('org-1', 'win', 'closed_won')
    expect(result).toEqual({ ok: true })
    expect(leadDocUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
  })
})

describe('createLead linked mode (customer_id)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copies the customer contact snapshot and skips find-or-create', async () => {
    vi.mocked(getCustomerCore).mockResolvedValue({
      id: 'c9', name: 'Dana Kim', company: 'Riverside', email: 'dana@riv.co', phone: '555-1234', created_at: 'x',
    })
    const lead = await createLead('o1', { customer_id: 'c9', title: 'Fall gala' })
    expect(getCustomerCore).toHaveBeenCalledWith('o1', 'c9')
    expect(findOrCreateCustomerCore).not.toHaveBeenCalled()
    expect(leadDocSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 'c9', name: 'Dana Kim', email: 'dana@riv.co', phone: '555-1234', organization: 'Riverside', title: 'Fall gala',
    }))
    expect(lead.customer_id).toBe('c9')
  })

  it('omits contact fields the customer does not have', async () => {
    vi.mocked(getCustomerCore).mockResolvedValue({ id: 'c9', name: 'Walk-in', created_at: 'x' })
    await createLead('o1', { customer_id: 'c9' })
    const written = leadDocSetSpy.mock.calls[0][0]
    expect(written).not.toHaveProperty('email')
    expect(written).not.toHaveProperty('phone')
    expect(written).not.toHaveProperty('organization')
  })

  it('throws Customer not found for an unknown id and writes nothing', async () => {
    vi.mocked(getCustomerCore).mockResolvedValue(null)
    await expect(createLead('o1', { customer_id: 'nope' })).rejects.toThrow('Customer not found')
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('still requires a name when no customer_id is given', async () => {
    await expect(createLead('o1', {})).rejects.toThrow('Please enter your name.')
  })

  it('does not require a name when a customer_id carries the identity', async () => {
    vi.mocked(getCustomerCore).mockResolvedValue({ id: 'c9', name: 'Dana Kim', created_at: 'x' })
    const lead = await createLead('o1', { customer_id: 'c9' })
    expect(lead.name).toBe('Dana Kim')
  })
})

/*
  New Opportunity increment 1 — createLead validates through the SHARED
  validator (lib/crm/validate: the same rules as public intake, throwing the
  first error), writes an optional follow-up task in the SAME Firestore batch
  as the lead doc, and logs a 'created' activity after the commit.
*/
describe('createLead shared validation (increment: New Opportunity)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid email with the intake message and writes nothing', async () => {
    await expect(createLead('o1', { name: 'Ada', email: 'not-an-email' })).rejects.toThrow(
      'Please enter a valid email address.'
    )
    expect(findOrCreateCustomerCore).not.toHaveBeenCalled()
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('rejects a malformed event_date and a fractional guest_count', async () => {
    await expect(createLead('o1', { name: 'Ada', event_date: '10/10/2026' })).rejects.toThrow(
      'Please pick a valid event date.'
    )
    await expect(createLead('o1', { name: 'Ada', guest_count: 3.5 })).rejects.toThrow(
      'Please enter a valid guest count.'
    )
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('rejects a negative estimated_value (operator-only rule)', async () => {
    await expect(createLead('o1', { name: 'Ada', estimated_value: -5 })).rejects.toThrow(
      'Please enter a valid estimated value.'
    )
    expect(leadDocSetSpy).not.toHaveBeenCalled()
  })

  it('accepts a PAST event_date — the client warns, the server never blocks', async () => {
    findOrCreateCustomerCore.mockResolvedValue({ customer: { id: 'c1', name: 'Ada', created_at: 'x' }, created: true })
    const lead = await createLead('o1', { name: 'Ada', event_date: '2000-01-01' })
    expect(lead.event_date).toBe('2000-01-01')
    expect(leadDocSetSpy).toHaveBeenCalled()
  })
})

describe('createLead follow-up at birth (increment: New Opportunity)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findOrCreateCustomerCore.mockResolvedValue({
      customer: { id: 'c1', name: 'Dana Kim', created_at: 'x' }, created: true,
    })
  })

  it('commits the lead AND the follow-up task in one batch (no plain set)', async () => {
    const lead = await createLead('o1', { name: 'Dana Kim', follow_up_date: '2026-09-16' })
    // Atomic: both docs go through the batch; the single-doc path is not used.
    expect(leadDocSetSpy).not.toHaveBeenCalled()
    expect(batchCommitSpy).toHaveBeenCalledTimes(1)
    expect(batchSetSpy).toHaveBeenCalledTimes(2)
    const [leadRef, leadData] = batchSetSpy.mock.calls[0]
    const [taskRef, taskData] = batchSetSpy.mock.calls[1]
    expect(leadRef.set).toBe(leadDocSetSpy) // the lead doc ref
    expect(leadData).toMatchObject({ name: 'Dana Kim', stage: 'inquiry' })
    expect(taskRef.__taskDoc).toBe(taskData.id) // .../leads/{id}/tasks/{taskId}
    expect(taskData).toMatchObject({
      lead_id: lead.id,
      title: 'Follow up with Dana',
      done: false,
      due_date: '2026-09-16',
    })
    expect(taskData.id).toMatch(/^[0-9a-f]{16}$/)
    expect(taskData.created_at).toEqual(expect.any(String))
  })

  it('uses a supplied follow_up_title over the default', async () => {
    await createLead('o1', { name: 'Dana Kim', follow_up_date: '2026-09-16', follow_up_title: '  Send tasting menu  ' })
    expect(batchSetSpy.mock.calls[1][1].title).toBe('Send tasting menu')
  })

  it("defaults the title from the LINKED customer's name", async () => {
    vi.mocked(getCustomerCore).mockResolvedValue({ id: 'c9', name: 'Ada Lovelace', created_at: 'x' })
    await createLead('o1', { customer_id: 'c9', follow_up_date: '2026-09-16' })
    expect(batchSetSpy.mock.calls[1][1].title).toBe('Follow up with Ada')
  })

  it('without follow_up_date the plain single-doc write path is untouched', async () => {
    await createLead('o1', { name: 'Dana Kim' })
    expect(leadDocSetSpy).toHaveBeenCalledTimes(1)
    expect(batchSetSpy).not.toHaveBeenCalled()
    expect(batchCommitSpy).not.toHaveBeenCalled()
  })

  it('treats a blank follow_up_date as absent', async () => {
    await createLead('o1', { name: 'Dana Kim', follow_up_date: '   ' })
    expect(leadDocSetSpy).toHaveBeenCalledTimes(1)
    expect(batchSetSpy).not.toHaveBeenCalled()
  })

  it("logs a 'created' activity naming the booked follow-up", async () => {
    const lead = await createLead('o1', { name: 'Dana Kim', follow_up_date: '2026-09-16' })
    expect(logActivity).toHaveBeenCalledWith('o1', {
      parent_type: 'opportunity',
      parent_id: lead.id,
      kind: 'created',
      summary: 'Opportunity created · follow-up booked for 2026-09-16',
    })
  })

  it("logs a plain 'created' activity when no follow-up is set", async () => {
    const lead = await createLead('o1', { name: 'Dana Kim' })
    expect(logActivity).toHaveBeenCalledWith('o1', {
      parent_type: 'opportunity',
      parent_id: lead.id,
      kind: 'created',
      summary: 'Opportunity created',
    })
  })

  it('the activity is logged AFTER the batch commit (write-then-log order)', async () => {
    const order: string[] = []
    batchCommitSpy.mockImplementationOnce(async () => { order.push('commit') })
    vi.mocked(logActivity).mockImplementationOnce(async () => { order.push('log') })
    await createLead('o1', { name: 'Dana Kim', follow_up_date: '2026-09-16' })
    expect(order).toEqual(['commit', 'log'])
  })
})
