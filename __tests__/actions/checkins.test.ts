import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkinDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const getCheckinDocSpy = vi.hoisted(() => vi.fn())
const getCheckinsByDateSpy = vi.hoisted(() => vi.fn())
const getFamiliesSpy = vi.hoisted(() => vi.fn())
const getMembersSpy = vi.hoisted(() => vi.fn())
const getAssignmentsSpy = vi.hoisted(() => vi.fn())
const getSignedFormsSpy = vi.hoisted(() => vi.fn())

// The custody mutations run inside adminDb.runTransaction. The mock threads a
// tx whose get() delegates to the per-doc read spy and whose writes land on one
// shared spy set, so tests can assert reads-then-writes per transaction —
// mirrors the transactional-core mocks in __tests__/lib/ops/event-ops.test.ts.
const txSpy = vi.hoisted(() => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))
const runTransactionSpy = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      get: (ref: { get: () => Promise<unknown> }) => ref.get(),
      set: txSpy.set,
      update: txSpy.update,
      delete: txSpy.delete,
    })
  )
)

vi.mock('@/lib/firebase-admin', () => {
  const signedFormsQuery: Record<string, unknown> = { get: getSignedFormsSpy }
  signedFormsQuery.where = vi.fn().mockReturnValue(signedFormsQuery)
  return {
    adminDb: {
      runTransaction: runTransactionSpy,
      collectionGroup: vi.fn().mockReturnValue(signedFormsQuery),
      collection: vi.fn().mockImplementation((col: string) => {
        if (col === 'orgs') {
          return {
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockImplementation((sub: string) => {
                if (sub === 'events') {
                  return {
                    doc: vi.fn().mockReturnValue({
                      collection: vi.fn().mockImplementation((sub2: string) => {
                        if (sub2 === 'checkins') {
                          return {
                            doc: vi.fn().mockImplementation((id: string) => ({
                              ...checkinDocSpy,
                              get: getCheckinDocSpy,
                              id,
                            })),
                            where: vi.fn().mockReturnValue({ get: getCheckinsByDateSpy }),
                          }
                        }
                        if (sub2 === 'families') {
                          return {
                            get: getFamiliesSpy,
                            doc: vi.fn().mockReturnValue({
                              collection: vi.fn().mockReturnValue({ get: getMembersSpy }),
                            }),
                          }
                        }
                        if (sub2 === 'form_assignments') {
                          return { get: getAssignmentsSpy }
                        }
                        return {}
                      }),
                    }),
                  }
                }
                return {}
              }),
            }),
          }
        }
        return {}
      }),
    },
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertOrgAdmin: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
  assertEventPage: vi.fn().mockResolvedValue({ role: 'admin', event_access: {} }),
}))

import {
  listAllEventMembers,
  getCheckinsForDate,
  checkInMember,
  checkOutMember,
  checkInFamily,
  checkOutFamily,
  undoCheckinChanges,
  getCheckinSummary,
  type CheckinUndoChange,
  type CustodyCheckinRecord,
} from '@/actions/checkins'

function lastTxSetArg(): CustodyCheckinRecord {
  return txSpy.set.mock.calls[txSpy.set.mock.calls.length - 1][1]
}

describe('listAllEventMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAssignmentsSpy.mockResolvedValue({ docs: [] })
    getSignedFormsSpy.mockResolvedValue({ docs: [] })
  })

  it('flattens members of non-cancelled families with family context', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        { id: 'fam-1', data: () => ({ id: 'fam-1', last_name: 'Smith', registration_status: 'confirmed' }) },
        { id: 'fam-2', data: () => ({ id: 'fam-2', last_name: 'Jones', registration_status: 'cancelled' }) },
      ],
    })
    getMembersSpy.mockResolvedValueOnce({
      docs: [
        { id: 'm-1', data: () => ({ id: 'm-1', family_id: 'fam-1', first_name: 'Ann', last_name: 'Smith' }) },
        { id: 'm-2', data: () => ({ id: 'm-2', family_id: 'fam-1', first_name: 'Bo', last_name: 'Smith' }) },
      ],
    })

    const members = await listAllEventMembers('org-1', 'camp-1')

    expect(members).toHaveLength(2)
    expect(members[0]).toMatchObject({
      member_id: 'm-1',
      family_id: 'fam-1',
      first_name: 'Ann',
      family_name: 'Smith',
    })
    expect(getMembersSpy).toHaveBeenCalledTimes(1)
  })

  it('sorts by family name then member name, server-side', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        { id: 'fam-w', data: () => ({ id: 'fam-w', last_name: 'Wu', registration_status: 'confirmed' }) },
        { id: 'fam-a', data: () => ({ id: 'fam-a', last_name: 'Alvarez', registration_status: 'confirmed' }) },
      ],
    })
    getMembersSpy
      .mockResolvedValueOnce({
        docs: [{ id: 'm-w1', data: () => ({ first_name: 'Zed', last_name: 'Wu' }) }],
      })
      .mockResolvedValueOnce({
        docs: [
          { id: 'm-a2', data: () => ({ first_name: 'Cara', last_name: 'Alvarez' }) },
          { id: 'm-a1', data: () => ({ first_name: 'Abe', last_name: 'Alvarez' }) },
        ],
      })

    const members = await listAllEventMembers('org-1', 'camp-1')
    expect(members.map((m) => m.member_id)).toEqual(['m-a1', 'm-a2', 'm-w1'])
  })

  it('projects allergy text, family balance, guardian quick-pick names, and missing required forms', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        {
          id: 'fam-1',
          data: () => ({
            id: 'fam-1',
            first_name: 'Pat',
            last_name: 'Smith',
            registration_status: 'confirmed',
            amount_due: 250,
            amount_paid: 100,
            emergency_contact: { name: 'Gran Smith', phone: '208-555-0000', relationship: 'grandmother' },
          }),
        },
      ],
    })
    getMembersSpy.mockResolvedValueOnce({
      docs: [
        {
          id: 'm-1',
          data: () => ({ first_name: 'Ann', last_name: 'Smith', allergies: 'Peanuts', medical_notes: 'Inhaler in bag' }),
        },
        { id: 'm-2', data: () => ({ first_name: 'Bo', last_name: 'Smith', allergies: '', medical_notes: '' }) },
      ],
    })
    getAssignmentsSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: 'a-1', template_name: 'Liability Waiver', required: true, audience: 'registrant' }) },
        { data: () => ({ id: 'a-2', template_name: 'Volunteer NDA', required: true, audience: 'volunteer' }) },
        { data: () => ({ id: 'a-3', template_name: 'Photo Consent', required: false, audience: 'registrant' }) },
      ],
    })
    getSignedFormsSpy.mockResolvedValue({ docs: [] })

    const members = await listAllEventMembers('org-1', 'camp-1')

    expect(members[0]).toMatchObject({
      allergy_text: 'Peanuts · Inhaler in bag',
      family_balance_due: 150,
      registering_parent: 'Pat Smith',
      emergency_contact_name: 'Gran Smith',
      emergency_contact_phone: '208-555-0000',
      missing_form_names: ['Liability Waiver'], // required+registrant only
    })
    expect(members[1].allergy_text).toBe('')
  })

  it('clears the missing-form flag once the family has signed, and floors balance at zero', async () => {
    getFamiliesSpy.mockResolvedValue({
      docs: [
        {
          id: 'fam-1',
          data: () => ({ id: 'fam-1', last_name: 'Smith', registration_status: 'confirmed', amount_due: 100, amount_paid: 180 }),
        },
      ],
    })
    getMembersSpy.mockResolvedValueOnce({
      docs: [{ id: 'm-1', data: () => ({ first_name: 'Ann', last_name: 'Smith' }) }],
    })
    getAssignmentsSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'a-1', template_name: 'Liability Waiver', required: true, audience: 'registrant' }) }],
    })
    getSignedFormsSpy.mockResolvedValue({
      docs: [
        {
          ref: { parent: { parent: { id: 'fam-1' } } },
          data: () => ({ assignment_id: 'a-1' }),
        },
      ],
    })

    const members = await listAllEventMembers('org-1', 'camp-1')
    expect(members[0].missing_form_names).toEqual([])
    expect(members[0].family_balance_due).toBe(0)
  })
})

describe('getCheckinsForDate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns checkin records for a given date', async () => {
    getCheckinsByDateSpy.mockResolvedValue({
      docs: [
        { data: () => ({ id: '2026-07-10_m-1', date: '2026-07-10', member_id: 'm-1', status: 'in' }) },
      ],
    })
    const records = await getCheckinsForDate('org-1', 'camp-1', '2026-07-10')
    expect(records).toHaveLength(1)
    expect(records[0].member_id).toBe('m-1')
  })
})

describe('checkInMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCheckinDocSpy.mockResolvedValue({ exists: false })
  })

  it('writes a checkin record with deterministic id, status in, and timestamp — inside a transaction', async () => {
    const rec = await checkInMember('org-1', 'camp-1', {
      date: '2026-07-10',
      memberId: 'm-1',
      familyId: 'fam-1',
      memberName: 'Ann Smith',
      checkedInBy: 'Admin User',
    })
    expect(runTransactionSpy).toHaveBeenCalledTimes(1)
    expect(txSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ id: '2026-07-10_m-1' }),
      expect.objectContaining({
        id: '2026-07-10_m-1',
        date: '2026-07-10',
        member_id: 'm-1',
        family_id: 'fam-1',
        member_name: 'Ann Smith',
        status: 'in',
        checked_in_at: expect.any(String),
        checked_in_by: 'Admin User',
      })
    )
    // The read-modify-write never bypasses the transaction.
    expect(checkinDocSpy.set).not.toHaveBeenCalled()
    expect(rec.status).toBe('in')
    expect(rec.id).toBe('2026-07-10_m-1')
  })

  it('stamps first_checked_in_at and an id-bearing opening history entry on a fresh check-in', async () => {
    const rec = await checkInMember('org-1', 'camp-1', {
      date: '2026-07-10',
      memberId: 'm-1',
      familyId: 'fam-1',
      memberName: 'Ann Smith',
    })
    expect(rec.first_checked_in_at).toBe(rec.checked_in_at)
    // Server-stamped entry id: this is what undo references instead of a snapshot.
    expect(rec.history).toEqual([
      { id: expect.any(String), action: 'check_in', at: rec.checked_in_at },
    ])
  })

  it('preserves the original arrival on re-check-in and moves the finished cycle into history', async () => {
    getCheckinDocSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: '2026-07-10_m-1',
        date: '2026-07-10',
        member_id: 'm-1',
        family_id: 'fam-1',
        member_name: 'Ann Smith',
        status: 'out',
        checked_in_at: '2026-07-10T15:02:00.000Z',
        checked_out_at: '2026-07-10T19:11:00.000Z',
        guardian_pickup_name: 'Jane Smith',
      }),
    })

    const rec = await checkInMember('org-1', 'camp-1', {
      date: '2026-07-10',
      memberId: 'm-1',
      familyId: 'fam-1',
      memberName: 'Ann Smith',
    })

    const written = lastTxSetArg()
    expect(written.status).toBe('in')
    // The original arrival survives the re-check-in (never wholesale-overwritten),
    // through the transactional path.
    expect(written.first_checked_in_at).toBe('2026-07-10T15:02:00.000Z')
    // Legacy doc without history: the prior cycle is derived into the trail
    // (derived entries carry no id — only server-written entries do).
    expect(written.history).toEqual([
      { action: 'check_in', at: '2026-07-10T15:02:00.000Z' },
      { action: 'check_out', at: '2026-07-10T19:11:00.000Z', guardian: 'Jane Smith' },
      { id: expect.any(String), action: 'check_in', at: rec.checked_in_at },
    ])
    // The finished cycle's checkout fields do not linger on the live 'in' record.
    expect(written.checked_out_at).toBeUndefined()
    expect(written.guardian_pickup_name).toBeUndefined()
  })
})

describe('checkOutMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCheckinDocSpy.mockResolvedValue({
      exists: true,
      data: () => ({
        id: '2026-07-10_m-1',
        date: '2026-07-10',
        member_id: 'm-1',
        family_id: 'fam-1',
        member_name: 'Ann Smith',
        status: 'in',
        checked_in_at: '2026-07-10T15:02:00.000Z',
      }),
    })
  })

  it('updates record to status out with checked_out_at, inside a transaction', async () => {
    await checkOutMember('org-1', 'camp-1', '2026-07-10_m-1')
    expect(runTransactionSpy).toHaveBeenCalledTimes(1)
    expect(txSpy.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: '2026-07-10_m-1' }),
      expect.objectContaining({
        status: 'out',
        checked_out_at: expect.any(String),
      })
    )
    expect(checkinDocSpy.update).not.toHaveBeenCalled()
  })

  it('records guardian pickup name when provided', async () => {
    await checkOutMember('org-1', 'camp-1', '2026-07-10_m-1', 'Jane Smith (mother)')
    expect(txSpy.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'out',
        guardian_pickup_name: 'Jane Smith (mother)',
      })
    )
  })

  it('appends the checkout to history and backfills first_checked_in_at on legacy docs', async () => {
    const rec = await checkOutMember('org-1', 'camp-1', '2026-07-10_m-1', 'Jane Smith')
    const update = txSpy.update.mock.calls[0][1]
    expect(update.first_checked_in_at).toBe('2026-07-10T15:02:00.000Z')
    expect(update.history).toEqual([
      { action: 'check_in', at: '2026-07-10T15:02:00.000Z' },
      { id: expect.any(String), action: 'check_out', at: rec.checked_out_at, guardian: 'Jane Smith' },
    ])
    expect(update.guardian_flag).toBeUndefined()
  })

  it('flags a free-typed guardian as an unlisted_guardian exception', async () => {
    await checkOutMember('org-1', 'camp-1', '2026-07-10_m-1', 'Random Neighbor', { unlistedGuardian: true })
    const update = txSpy.update.mock.calls[0][1]
    expect(update.guardian_flag).toBe('unlisted_guardian')
    expect(update.history[update.history.length - 1]).toMatchObject({
      action: 'check_out',
      guardian: 'Random Neighbor',
      flag: 'unlisted_guardian',
    })
  })

  it('throws when the check-in record does not exist', async () => {
    getCheckinDocSpy.mockResolvedValue({ exists: false })
    await expect(checkOutMember('org-1', 'camp-1', 'missing_id')).rejects.toThrow('Check-in record not found')
    expect(txSpy.update).not.toHaveBeenCalled()
  })
})

describe('checkInFamily', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCheckinDocSpy.mockResolvedValue({ exists: false })
  })

  it('checks in every sibling in ONE atomic commit, preserving any prior arrivals', async () => {
    // m-2 was already in and out once today; her original arrival must survive.
    getCheckinDocSpy
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: '2026-07-10_m-2',
          date: '2026-07-10',
          member_id: 'm-2',
          family_id: 'fam-1',
          member_name: 'Bo Smith',
          status: 'out',
          checked_in_at: '2026-07-10T15:02:00.000Z',
          checked_out_at: '2026-07-10T17:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({ exists: false })

    const records = await checkInFamily('org-1', 'camp-1', {
      date: '2026-07-10',
      familyId: 'fam-1',
      members: [
        { memberId: 'm-1', memberName: 'Ann Smith' },
        { memberId: 'm-2', memberName: 'Bo Smith' },
        { memberId: 'm-3', memberName: 'Cy Smith' },
      ],
    })

    // ONE transaction: all sibling reads and writes are contention-checked together.
    expect(runTransactionSpy).toHaveBeenCalledTimes(1)
    expect(txSpy.set).toHaveBeenCalledTimes(3)
    // No writes outside the transaction.
    expect(checkinDocSpy.set).not.toHaveBeenCalled()
    expect(records).toHaveLength(3)
    expect(records.every((r) => r.status === 'in')).toBe(true)
    // first_checked_in_at survives the re-check-in through the transactional bulk path.
    expect(records[1].first_checked_in_at).toBe('2026-07-10T15:02:00.000Z')
    expect(records[0].first_checked_in_at).toBe(records[0].checked_in_at)
  })
})

describe('checkOutFamily', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCheckinDocSpy.mockImplementation(() =>
      Promise.resolve({
        exists: true,
        data: () => ({
          id: 'rec',
          date: '2026-07-10',
          member_id: 'm-x',
          family_id: 'fam-1',
          member_name: 'Kid Smith',
          status: 'in',
          checked_in_at: '2026-07-10T15:02:00.000Z',
        }),
      })
    )
  })

  it('applies ONE guardian capture to every sibling in ONE atomic transaction', async () => {
    const records = await checkOutFamily('org-1', 'camp-1', {
      recordIds: ['2026-07-10_m-1', '2026-07-10_m-2'],
      guardianPickupName: 'Jane Smith',
    })

    expect(runTransactionSpy).toHaveBeenCalledTimes(1)
    expect(txSpy.update).toHaveBeenCalledTimes(2)
    expect(checkinDocSpy.update).not.toHaveBeenCalled()
    for (const call of txSpy.update.mock.calls) {
      expect(call[1]).toMatchObject({ status: 'out', guardian_pickup_name: 'Jane Smith' })
    }
    expect(records).toHaveLength(2)
    expect(records.every((r) => r.guardian_pickup_name === 'Jane Smith')).toBe(true)
  })

  it('flags an unlisted guardian on every sibling record', async () => {
    await checkOutFamily('org-1', 'camp-1', {
      recordIds: ['2026-07-10_m-1', '2026-07-10_m-2'],
      guardianPickupName: 'Random Neighbor',
      unlistedGuardian: true,
    })
    for (const call of txSpy.update.mock.calls) {
      expect(call[1].guardian_flag).toBe('unlisted_guardian')
    }
  })

  it('throws before writing when any record is missing', async () => {
    getCheckinDocSpy
      .mockResolvedValueOnce({ exists: true, data: () => ({ status: 'in', checked_in_at: 'T0' }) })
      .mockResolvedValueOnce({ exists: false })
    await expect(
      checkOutFamily('org-1', 'camp-1', { recordIds: ['a', 'b'], guardianPickupName: 'Jane' })
    ).rejects.toThrow('Check-in record not found')
    expect(txSpy.update).not.toHaveBeenCalled()
  })
})

describe('undoCheckinChanges', () => {
  beforeEach(() => vi.clearAllMocks())

  // A doc whose ONLY history entry is the check-in being undone (fresh create).
  const freshCheckinDoc = (entryId: string) => ({
    exists: true,
    data: () => ({
      id: '2026-07-10_m-1',
      date: '2026-07-10',
      member_id: 'm-1',
      family_id: 'fam-1',
      member_name: 'Ann Smith',
      status: 'in',
      checked_in_at: '2026-07-10T15:02:00.000Z',
      first_checked_in_at: '2026-07-10T15:02:00.000Z',
      history: [{ id: entryId, action: 'check_in', at: '2026-07-10T15:02:00.000Z' }],
    }),
  })

  // An 'in' doc after a re-check-in: in(A) → out(B, Jane) → in(C). Undoing the
  // last entry must restore the checked-out state ENTIRELY from this history.
  const recheckedInDoc = () => ({
    exists: true,
    data: () => ({
      id: '2026-07-10_m-1',
      date: '2026-07-10',
      member_id: 'm-1',
      family_id: 'fam-1',
      member_name: 'Ann Smith',
      status: 'in',
      checked_in_at: '2026-07-10T20:00:00.000Z',
      first_checked_in_at: '2026-07-10T15:02:00.000Z',
      history: [
        { id: 'e-1', action: 'check_in', at: '2026-07-10T15:02:00.000Z' },
        { id: 'e-2', action: 'check_out', at: '2026-07-10T19:11:00.000Z', guardian: 'Jane Smith' },
        { id: 'e-3', action: 'check_in', at: '2026-07-10T20:00:00.000Z' },
      ],
    }),
  })

  it('deletes a record only after verifying the undone check-in opened it (server-side fresh-create check)', async () => {
    getCheckinDocSpy.mockResolvedValueOnce(freshCheckinDoc('e-1'))

    const result = await undoCheckinChanges('org-1', 'camp-1', [
      { recordId: '2026-07-10_m-1', entryId: 'e-1' },
    ])

    expect(runTransactionSpy).toHaveBeenCalledTimes(1)
    expect(txSpy.delete).toHaveBeenCalledTimes(1)
    expect(txSpy.set).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, records: [null] })
  })

  it('restores exclusively from server-held history — an undone re-check-in returns to the recorded checkout state', async () => {
    getCheckinDocSpy.mockResolvedValueOnce(recheckedInDoc())

    const result = await undoCheckinChanges('org-1', 'camp-1', [
      { recordId: '2026-07-10_m-1', entryId: 'e-3' },
    ])

    expect(txSpy.set).toHaveBeenCalledTimes(1)
    expect(txSpy.delete).not.toHaveBeenCalled()
    const restored = txSpy.set.mock.calls[0][1] as CustodyCheckinRecord
    // Every restored field comes from the doc's own history entries.
    expect(restored).toMatchObject({
      status: 'out',
      checked_in_at: '2026-07-10T15:02:00.000Z',
      first_checked_in_at: '2026-07-10T15:02:00.000Z',
      checked_out_at: '2026-07-10T19:11:00.000Z',
      guardian_pickup_name: 'Jane Smith',
    })
    // The reversal is recorded as a new server-stamped entry — the trail only grows.
    expect(restored.history).toHaveLength(4)
    expect(restored.history?.slice(0, 3).map((e) => e.id)).toEqual(['e-1', 'e-2', 'e-3'])
    expect(restored.history?.[3]).toMatchObject({ id: expect.any(String), action: 'undo' })
    expect(result.ok).toBe(true)
    expect(result.records[0]).toEqual(restored)
  })

  it('undoing a checkout restores a clean checked-in state with no lingering checkout fields', async () => {
    getCheckinDocSpy.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: '2026-07-10_m-1',
        date: '2026-07-10',
        member_id: 'm-1',
        family_id: 'fam-1',
        member_name: 'Ann Smith',
        status: 'out',
        checked_in_at: '2026-07-10T15:02:00.000Z',
        first_checked_in_at: '2026-07-10T15:02:00.000Z',
        checked_out_at: '2026-07-10T19:11:00.000Z',
        guardian_pickup_name: 'Jane Smith',
        history: [
          { id: 'e-1', action: 'check_in', at: '2026-07-10T15:02:00.000Z' },
          { id: 'e-2', action: 'check_out', at: '2026-07-10T19:11:00.000Z', guardian: 'Jane Smith' },
        ],
      }),
    })

    const result = await undoCheckinChanges('org-1', 'camp-1', [
      { recordId: '2026-07-10_m-1', entryId: 'e-2' },
    ])

    const restored = txSpy.set.mock.calls[0][1] as CustodyCheckinRecord
    expect(restored.status).toBe('in')
    expect(restored.checked_in_at).toBe('2026-07-10T15:02:00.000Z')
    expect(restored.checked_out_at).toBeUndefined()
    expect(restored.guardian_pickup_name).toBeUndefined()
    expect(restored.guardian_flag).toBeUndefined()
    expect(result.ok).toBe(true)
  })

  it('rejects with zero writes when a newer entry exists — a concurrent guardian pickup is never destroyed', async () => {
    // Device A checked Ann in (entry e-3). Device B has since checked her out
    // to Jane Smith (entry e-4). A's undo of e-3 must NOT delete or rewrite.
    const current = {
      id: '2026-07-10_m-1',
      date: '2026-07-10',
      member_id: 'm-1',
      family_id: 'fam-1',
      member_name: 'Ann Smith',
      status: 'out' as const,
      checked_in_at: '2026-07-10T20:00:00.000Z',
      first_checked_in_at: '2026-07-10T15:02:00.000Z',
      checked_out_at: '2026-07-10T20:05:00.000Z',
      guardian_pickup_name: 'Jane Smith',
      history: [
        { id: 'e-3', action: 'check_in' as const, at: '2026-07-10T20:00:00.000Z' },
        { id: 'e-4', action: 'check_out' as const, at: '2026-07-10T20:05:00.000Z', guardian: 'Jane Smith' },
      ],
    }
    getCheckinDocSpy.mockResolvedValueOnce({ exists: true, data: () => current })

    const result = await undoCheckinChanges('org-1', 'camp-1', [
      { recordId: '2026-07-10_m-1', entryId: 'e-3' },
    ])

    expect(txSpy.set).not.toHaveBeenCalled()
    expect(txSpy.update).not.toHaveBeenCalled()
    expect(txSpy.delete).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('stale')
    // The concurrent pickup survives intact and is handed back for reconciliation.
    expect(result.records[0]).toEqual(current)
  })

  it('rejects with zero writes when the record no longer exists', async () => {
    getCheckinDocSpy.mockResolvedValueOnce({ exists: false })

    const result = await undoCheckinChanges('org-1', 'camp-1', [
      { recordId: '2026-07-10_m-1', entryId: 'e-1' },
    ])

    expect(txSpy.delete).not.toHaveBeenCalled()
    expect(txSpy.set).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: 'stale', records: [null] })
  })

  it('ignores forged client fields entirely — the restore state cannot be authored by the caller', async () => {
    getCheckinDocSpy.mockResolvedValueOnce(recheckedInDoc())

    // A malicious checkin-grant holder smuggles a full fabricated record in the
    // payload (the old API's `prior` snapshot). The server must not read it.
    const forged = {
      recordId: '2026-07-10_m-1',
      entryId: 'e-3',
      prior: {
        id: '2026-07-10_m-1',
        status: 'out',
        checked_out_at: '2026-07-10T17:00:00.000Z',
        guardian_pickup_name: 'Fake Person',
        history: [
          { action: 'check_in', at: '2026-07-09T09:00:00.000Z' },
          { action: 'check_out', at: '2026-07-09T10:00:00.000Z', guardian: 'Fake Person' },
        ],
      },
    } as unknown as CheckinUndoChange

    const result = await undoCheckinChanges('org-1', 'camp-1', [forged])

    expect(result.ok).toBe(true)
    const restored = txSpy.set.mock.calls[0][1] as CustodyCheckinRecord
    // Restored from the SERVER's history — none of the forged values appear.
    expect(restored.guardian_pickup_name).toBe('Jane Smith')
    expect(restored.checked_out_at).toBe('2026-07-10T19:11:00.000Z')
    expect(JSON.stringify(restored)).not.toContain('Fake Person')
    expect(JSON.stringify(restored)).not.toContain('2026-07-09')
  })

  it('handles a mixed bulk undo (fresh create deleted, overwrite restored) in one transaction', async () => {
    getCheckinDocSpy
      .mockResolvedValueOnce(freshCheckinDoc('e-1'))
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: '2026-07-10_m-2',
          date: '2026-07-10',
          member_id: 'm-2',
          family_id: 'fam-1',
          member_name: 'Bo Smith',
          status: 'in',
          checked_in_at: '2026-07-10T20:00:00.000Z',
          first_checked_in_at: '2026-07-10T15:02:00.000Z',
          history: [
            { id: 'f-1', action: 'check_in', at: '2026-07-10T15:02:00.000Z' },
            { id: 'f-2', action: 'check_out', at: '2026-07-10T17:00:00.000Z' },
            { id: 'f-3', action: 'check_in', at: '2026-07-10T20:00:00.000Z' },
          ],
        }),
      })

    const result = await undoCheckinChanges('org-1', 'camp-1', [
      { recordId: '2026-07-10_m-1', entryId: 'e-1' },
      { recordId: '2026-07-10_m-2', entryId: 'f-3' },
    ])

    expect(runTransactionSpy).toHaveBeenCalledTimes(1)
    expect(txSpy.delete).toHaveBeenCalledTimes(1)
    expect(txSpy.set).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    expect(result.records[0]).toBeNull()
    expect(result.records[1]).toMatchObject({ member_id: 'm-2', status: 'out' })
  })

  it('bulk undo is all-or-nothing: one stale reference cancels every write', async () => {
    getCheckinDocSpy
      .mockResolvedValueOnce(freshCheckinDoc('e-1'))
      // Second record has moved on: latest entry is f-4, client references f-3.
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: '2026-07-10_m-2',
          date: '2026-07-10',
          member_id: 'm-2',
          family_id: 'fam-1',
          member_name: 'Bo Smith',
          status: 'out',
          checked_in_at: '2026-07-10T20:00:00.000Z',
          checked_out_at: '2026-07-10T20:30:00.000Z',
          history: [
            { id: 'f-3', action: 'check_in', at: '2026-07-10T20:00:00.000Z' },
            { id: 'f-4', action: 'check_out', at: '2026-07-10T20:30:00.000Z' },
          ],
        }),
      })

    const result = await undoCheckinChanges('org-1', 'camp-1', [
      { recordId: '2026-07-10_m-1', entryId: 'e-1' },
      { recordId: '2026-07-10_m-2', entryId: 'f-3' },
    ])

    // Even the individually-valid first change is NOT applied.
    expect(txSpy.delete).not.toHaveBeenCalled()
    expect(txSpy.set).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.records).toHaveLength(2)
  })

  it("never accepts an 'undo' entry as the undo target", async () => {
    getCheckinDocSpy.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        id: '2026-07-10_m-1',
        date: '2026-07-10',
        member_id: 'm-1',
        family_id: 'fam-1',
        member_name: 'Ann Smith',
        // The undo entry e-3 reversed the checkout e-2, so the doc is live 'in'.
        status: 'in',
        checked_in_at: '2026-07-10T15:02:00.000Z',
        history: [
          { id: 'e-1', action: 'check_in', at: '2026-07-10T15:02:00.000Z' },
          { id: 'e-2', action: 'check_out', at: '2026-07-10T19:11:00.000Z' },
          { id: 'e-3', action: 'undo', at: '2026-07-10T19:12:00.000Z' },
        ],
      }),
    })

    const result = await undoCheckinChanges('org-1', 'camp-1', [
      { recordId: '2026-07-10_m-1', entryId: 'e-3' },
    ])

    expect(result.ok).toBe(false)
    expect(txSpy.set).not.toHaveBeenCalled()
    expect(txSpy.delete).not.toHaveBeenCalled()
  })
})

describe('getCheckinSummary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts records by status for a date', async () => {
    getCheckinsByDateSpy.mockResolvedValue({
      docs: [
        { data: () => ({ status: 'in' }) },
        { data: () => ({ status: 'in' }) },
        { data: () => ({ status: 'out' }) },
      ],
    })
    const summary = await getCheckinSummary('org-1', 'camp-1', '2026-07-10')
    expect(summary).toEqual({ checkedIn: 2, checkedOut: 1, total: 3 })
  })
})
