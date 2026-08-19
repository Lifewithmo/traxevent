import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getSpy, proposalUpdateSpy, leadUpdateSpy, leadDocSpy, orgGetSpy, leadGetSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  proposalUpdateSpy: vi.fn().mockResolvedValue(undefined),
  leadUpdateSpy: vi.fn().mockResolvedValue(undefined),
  leadDocSpy: vi.fn(),
  // The org read behind the public `branding` projection. Defaults to an
  // org with no branding — the neutral theme — so every existing projection
  // assertion is exercised with the lookup in place.
  orgGetSpy: vi.fn().mockResolvedValue({ data: () => undefined }),
  // The lead read behind the public `contact` pre-fill (name/email only —
  // see the allowlist comment on PublicProposal.contact). Defaults to no
  // lead data so every existing projection assertion is unaffected.
  leadGetSpy: vi.fn().mockResolvedValue({ data: () => undefined }),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collectionGroup: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: getSpy,
    // orgs/{orgId} supports both `.get()` (branding) and
    // `.collection('leads').doc(leadId).get()` (contact pre-fill).
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: orgGetSpy,
        collection: vi.fn().mockReturnValue({
          doc: vi.fn().mockReturnValue({ get: leadGetSpy }),
        }),
      }),
    }),
  },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (k: string) => (k === 'x-forwarded-for' ? '203.0.113.7, 10.0.0.1' : k === 'user-agent' ? 'JestUA/1.0' : null),
  }),
}))
vi.mock('@/lib/email', () => ({ sendProposalSignedConfirmation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/actions/domains', () => ({ getVerifiedSendingDomain: vi.fn().mockResolvedValue('mail.acme.com') }))

import { getPublicProposal, respondToProposal, signProposal, recordProposalView } from '@/actions/proposals-public'

// Builds a snapshot whose single doc carries `data` and a `ref` whose
// parent.parent is the org, so a lead advance resolves to
// orgs/org-1/leads/{lead_id} — the org/lead come only from the doc path.
function mockSnapshot(data: Record<string, unknown> | null) {
  if (data === null) {
    getSpy.mockResolvedValue({ empty: true, docs: [] })
    return
  }
  leadDocSpy.mockReturnValue({ update: leadUpdateSpy })
  const orgRef = {
    id: 'org-1',
    collection: vi.fn().mockReturnValue({ doc: leadDocSpy }),
  }
  const ref = {
    update: proposalUpdateSpy,
    parent: { parent: orgRef },
  }
  getSpy.mockResolvedValue({
    empty: false,
    docs: [{ data: () => data, ref }],
  })
}

beforeEach(() => {
  getSpy.mockReset()
  proposalUpdateSpy.mockClear()
  leadUpdateSpy.mockClear()
  leadDocSpy.mockClear()
})

describe('getPublicProposal', () => {
  // A full Firestore doc as it exists at rest, including the secret/internal
  // fields that must NEVER reach a public caller.
  function fullDoc(status: string) {
    return {
      id: 'p1',
      org_id: 'org-1',
      lead_id: 'lead-1',
      token: 'super-secret-token',
      title: 'Wedding Package',
      status,
      line_items: [{ description: 'Venue', quantity: 1, unit_price: 5000 }],
      notes: 'Deposit due on signing',
      client_response_at: '2026-06-01T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-15T00:00:00.000Z',
    }
  }

  it('returns null for an unknown token (empty snapshot)', async () => {
    mockSnapshot(null)
    expect(await getPublicProposal('nope')).toBeNull()
  })

  it('returns null for a draft proposal (drafts are never exposed)', async () => {
    mockSnapshot(fullDoc('draft'))
    expect(await getPublicProposal('tok')).toBeNull()
  })

  it('projects only public-safe fields for a sent proposal', async () => {
    const doc = fullDoc('sent')
    mockSnapshot(doc)
    expect(await getPublicProposal('tok')).toEqual({
      title: 'Wedding Package',
      status: 'sent',
      line_items: [{ description: 'Venue', quantity: 1, unit_price: 5000 }],
      notes: 'Deposit due on signing',
      client_response_at: '2026-06-01T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
    })
  })

  it('projects only public-safe fields for an accepted proposal', async () => {
    mockSnapshot(fullDoc('accepted'))
    const result = await getPublicProposal('tok')
    expect(result?.status).toBe('accepted')
    expect(result?.title).toBe('Wedding Package')
  })

  it('projects only public-safe fields for a rejected proposal', async () => {
    mockSnapshot(fullDoc('rejected'))
    const result = await getPublicProposal('tok')
    expect(result?.status).toBe('rejected')
  })

  it('never leaks the secret token or internal ids in the DTO', async () => {
    mockSnapshot(fullDoc('sent'))
    const result = await getPublicProposal('tok')
    expect(result).not.toBeNull()
    // These fields are seeded on the mocked doc; the DTO must strip them.
    expect('token' in (result as object)).toBe(false)
    expect('org_id' in (result as object)).toBe(false)
    expect('lead_id' in (result as object)).toBe(false)
    expect('id' in (result as object)).toBe(false)
    // No stray internal fields either.
    expect('updated_at' in (result as object)).toBe(false)
    expect(Object.keys(result as object).sort()).toEqual(
      ['client_response_at', 'created_at', 'line_items', 'notes', 'status', 'title'].sort(),
    )
  })

  it('omits optional fields that are absent on the doc', async () => {
    // Minimal doc: no title/notes/client_response_at, but still carries
    // secret fields that must be stripped.
    mockSnapshot({
      id: 'p1',
      org_id: 'org-1',
      lead_id: 'lead-1',
      token: 'super-secret-token',
      status: 'sent',
      line_items: [],
      created_at: '2026-05-01T00:00:00.000Z',
    })
    const result = await getPublicProposal('tok')
    expect(result).toEqual({
      status: 'sent',
      line_items: [],
      created_at: '2026-05-01T00:00:00.000Z',
    })
    expect('token' in (result as object)).toBe(false)
    expect('org_id' in (result as object)).toBe(false)
  })

  it('exposes blocks when present', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
      blocks: [{ id: 'a', type: 'paragraph', text: 'Hello' }],
    })
    const result = await getPublicProposal('tok')
    expect(result?.blocks).toEqual([{ id: 'a', type: 'paragraph', text: 'Hello' }])
  })

  it('omits blocks entirely when the proposal has none', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
    })
    const result = await getPublicProposal('tok')
    expect('blocks' in (result as object)).toBe(false)
  })

  it('projects terms when present and omits the key when absent', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'tok-with-terms',
      status: 'sent', line_items: [], created_at: 'x',
      terms: 'No refunds.',
    })
    const withTerms = await getPublicProposal('tok-with-terms')
    expect(withTerms?.terms).toBe('No refunds.')

    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'tok-plain',
      status: 'sent', line_items: [], created_at: 'x',
    })
    const withoutTerms = await getPublicProposal('tok-plain')
    expect(withoutTerms && Object.keys(withoutTerms)).not.toContain('terms')
  })

  it('still never leaks token, org_id, lead_id or id', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
      blocks: [{ id: 'a', type: 'paragraph', text: 'Hello' }],
    })
    const result = await getPublicProposal('tok') as unknown as Record<string, unknown>
    expect(result.token).toBeUndefined()
    expect(result.org_id).toBeUndefined()
    expect(result.lead_id).toBeUndefined()
    expect(result.id).toBeUndefined()
  })
})

describe('respondToProposal', () => {
  // Acceptance is retired from respondToProposal — signProposal is now the
  // ONLY path to 'accepted' (server-captured audit trail). The Increment-1
  // UI still calls respondToProposal('accepted', ...) until Task 6, so this
  // branch must throw loudly rather than silently close a deal unsigned.
  it('throws on accept — acceptance now requires signing — and writes nothing', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    await expect(respondToProposal('tok', 'accepted')).rejects.toThrow(
      'Acceptance now requires signing',
    )
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  // Re-expresses the old isolation coverage: accept is retired regardless of
  // which doc/lead it targets — no lookup-driven side effect happens either.
  it('throws on accept for any doc (isolation is moot — nothing is written)', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-from-doc', status: 'sent' })
    await expect(respondToProposal('tok', 'accepted')).rejects.toThrow(
      'Acceptance now requires signing',
    )
    expect(leadDocSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('rejects a sent proposal without advancing the lead', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    await respondToProposal('tok', 'rejected')

    expect(proposalUpdateSpy).toHaveBeenCalledTimes(1)
    expect(proposalUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
    )
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws and writes nothing for an already-accepted proposal', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'accepted' })
    await expect(respondToProposal('tok', 'accepted')).rejects.toThrow(
      'This proposal is no longer awaiting a response',
    )
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws and writes nothing for a draft proposal', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'draft' })
    await expect(respondToProposal('tok', 'accepted')).rejects.toThrow(
      'This proposal is no longer awaiting a response',
    )
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws for an unknown token', async () => {
    mockSnapshot(null)
    await expect(respondToProposal('nope', 'accepted')).rejects.toThrow(
      'Proposal not found',
    )
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws for an invalid response value without any lookup or writes', async () => {
    await expect(
      // @ts-expect-error deliberately passing an invalid response value
      respondToProposal('tok', 'maybe'),
    ).rejects.toThrow('Invalid response')
    expect(getSpy).not.toHaveBeenCalled()
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })
})

describe('getPublicProposal — selection fields', () => {
  it('projects packages/discount/tax_rate/deposit/expires_at/selection when present, still stripping internal', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'secret',
      title: 'Landscape', status: 'sent',
      line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
      packages: [{ id: 'good', name: 'Good', includes: ['Install'], price: 12500 }],
      discount: { type: 'percent', value: 10 }, tax_rate: 8.25, deposit: { type: 'percent', value: 50 },
      expires_at: '2026-09-01', created_at: '2026-05-01T00:00:00.000Z',
    })
    const r = await getPublicProposal('tok')
    expect(r?.packages).toEqual([{ id: 'good', name: 'Good', includes: ['Install'], price: 12500 }])
    expect(r?.discount).toEqual({ type: 'percent', value: 10 })
    expect(r?.tax_rate).toBe(8.25)
    expect(r?.deposit).toEqual({ type: 'percent', value: 50 })
    expect(r?.expires_at).toBe('2026-09-01')
    expect('token' in (r as object)).toBe(false)
    expect('org_id' in (r as object)).toBe(false)
    expect('lead_id' in (r as object)).toBe(false)
    expect('id' in (r as object)).toBe(false)
  })
})

describe('getPublicProposal — signature/audit projection', () => {
  it('projects deposit_gate/deposit_terms/payment_status', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'secret',
      status: 'sent', line_items: [],
      deposit: { type: 'percent', value: 50 }, deposit_gate: 'before_accept',
      deposit_terms: 'Non-refundable.', payment_status: 'deposit_pending',
      created_at: '2026-05-01T00:00:00.000Z',
    })
    const r = await getPublicProposal('tok')
    expect(r?.deposit_gate).toBe('before_accept')
    expect(r?.deposit_terms).toBe('Non-refundable.')
    expect(r?.payment_status).toBe('deposit_pending')
  })

  // SECURITY: a signed proposal's full audit record (ip/user_agent/document_hash/
  // signer_email, pending_signature, events) must never reach the public DTO —
  // only a reduced { signer_name, signed_at } summary.
  it('reduces `signature` to { signer_name, signed_at } and never leaks ip/user_agent/document_hash/signer_email, pending_signature, or events', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'secret',
      status: 'accepted', line_items: [],
      created_at: '2026-05-01T00:00:00.000Z',
      signature: {
        signer_name: 'Dana', signer_email: 'd@x.co', signed_at: '2026-06-01T00:00:00.000Z',
        ip: '203.0.113.7', user_agent: 'JestUA/1.0', consent_electronic: true,
        document_hash: 'a'.repeat(64),
      },
      pending_signature: { signer_name: 'Ghost', signer_email: 'g@x.co', captured_at: 'x', ip: '1.2.3.4', user_agent: 'ua', document_hash: 'b'.repeat(64), selection: { optional_item_ids: [], selected_total: 0, selected_at: 'x' } },
      events: [{ kind: 'signed', at: '2026-06-01T00:00:00.000Z', ip: '203.0.113.7', user_agent: 'JestUA/1.0' }],
    })
    const r = await getPublicProposal('tok')
    expect(r?.signed).toEqual({ signer_name: 'Dana', signed_at: '2026-06-01T00:00:00.000Z' })
    const flat = JSON.stringify(r)
    expect(flat).not.toContain('203.0.113.7')
    expect(flat).not.toContain('JestUA/1.0')
    expect(flat).not.toContain('a'.repeat(64))
    expect(flat).not.toContain('d@x.co')
    expect('signature' in (r as object)).toBe(false)
    expect('pending_signature' in (r as object)).toBe(false)
    expect('events' in (r as object)).toBe(false)
  })

  it('omits `signed` entirely when the proposal has no signature', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'secret',
      status: 'sent', line_items: [], created_at: '2026-05-01T00:00:00.000Z',
    })
    const r = await getPublicProposal('tok')
    expect('signed' in (r as object)).toBe(false)
  })

  it('projects the org branding for the themed public rendering, and omits it when the org has none', async () => {
    const doc = {
      id: 'p1', org_id: 'org-1', lead_id: 'lead-1', token: 'secret',
      status: 'sent', line_items: [], created_at: '2026-05-01T00:00:00.000Z',
    }
    mockSnapshot(doc)
    orgGetSpy.mockResolvedValueOnce({
      data: () => ({ name: 'Acme', branding: { display_name: 'Acme Events', accent_color: '#123456' } }),
    })
    const branded = await getPublicProposal('tok')
    expect(branded?.branding).toEqual({ display_name: 'Acme Events', accent_color: '#123456' })

    mockSnapshot(doc)
    const unbranded = await getPublicProposal('tok')
    expect('branding' in (unbranded as object)).toBe(false)
  })
})

// Selection helper shared by the retired-accept coverage below and by the
// signProposal selection tests further down.
function sentPackaged() {
  return {
    id: 'p1', lead_id: 'lead-1', status: 'sent',
    packages: [
      { id: 'good', name: 'Good', includes: [], price: 12500 },
      { id: 'best', name: 'Best', includes: [], price: 22400 },
    ],
    line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
  }
}

describe('respondToProposal — accept is retired', () => {
  // The Increment-1 selection-validation-on-accept behavior moved entirely
  // into signProposal (see below); respondToProposal's accept branch now
  // throws unconditionally, regardless of whether the selection would have
  // been valid, before any validation or write happens.
  it('throws "Acceptance now requires signing" even for an otherwise-valid selection, and writes nothing', async () => {
    mockSnapshot(sentPackaged())
    await expect(respondToProposal('tok', 'accepted', { package_id: 'best', optional_item_ids: ['o1'] }))
      .rejects.toThrow('Acceptance now requires signing')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('throws "Acceptance now requires signing" for a legacy itemized proposal with no selection', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    await expect(respondToProposal('tok', 'accepted')).rejects.toThrow('Acceptance now requires signing')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })
})

describe('signProposal', () => {
  function sentDeposit(gate: 'before_accept' | 'after_accept') {
    return {
      id: 'p1', lead_id: 'lead-1', status: 'sent',
      line_items: [{ id: 'o1', description: 'Lighting', quantity: 1, unit_price: 1500, optional: true }],
      packages: [{ id: 'good', name: 'Good', includes: [], price: 12500 }],
      deposit: { type: 'percent', value: 50 }, deposit_gate: gate, deposit_terms: 'terms',
    }
  }

  it('after_accept: signs, captures server-side ip/ua/hash, sets deposit_pending, advances closed_won', async () => {
    mockSnapshot(sentDeposit('after_accept'))
    const res = await signProposal('tok', { signer_name: 'Dana', signer_email: 'd@x.co', consent: true, selection: { package_id: 'good', optional_item_ids: ['o1'] } })
    const arg = proposalUpdateSpy.mock.calls[0][0]
    expect(arg.status).toBe('accepted')
    expect(arg.payment_status).toBe('deposit_pending')
    expect(arg.signature.signer_name).toBe('Dana')
    expect(arg.signature.ip).toBe('203.0.113.7')            // first x-forwarded-for hop, server-derived
    expect(arg.signature.user_agent).toBe('JestUA/1.0')
    expect(arg.signature.document_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(arg.signature.consent_electronic).toBe(true)
    expect(res.deposit_due).toBe(7000)                       // 50% of (12500+1500) with no tax? see note
    expect(leadUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
  })

  it('no deposit → payment_status not_required', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent', line_items: [] })
    const res = await signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true })
    expect(proposalUpdateSpy.mock.calls[0][0].payment_status).toBe('not_required')
    expect(res.deposit_due).toBe(0)
  })

  it('rejects missing consent / blank name / blank email', async () => {
    mockSnapshot(sentDeposit('after_accept'))
    await expect(signProposal('tok', { signer_name: '', signer_email: 'a@a.co', consent: true })).rejects.toThrow('Invalid request')
    await expect(signProposal('tok', { signer_name: 'A', signer_email: '', consent: true })).rejects.toThrow('Invalid request')
    await expect(signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: false })).rejects.toThrow('You must consent')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('is locked: throws for an already-signed or non-sent proposal, writes nothing', async () => {
    mockSnapshot({ ...sentDeposit('after_accept'), status: 'accepted', signature: { signer_name: 'X' } })
    await expect(signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true }))
      .rejects.toThrow('no longer awaiting a response')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('validates the selection against the proposal (bad package id)', async () => {
    mockSnapshot(sentDeposit('after_accept'))
    await expect(signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true, selection: { package_id: 'ghost', optional_item_ids: [] } }))
      .rejects.toThrow('Invalid selection')
  })

  // --- additional coverage carried over from the retired respondToProposal — selection suite ---

  it('requires a package when the proposal is packaged', async () => {
    mockSnapshot(sentPackaged())
    await expect(signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true, selection: { optional_item_ids: [] } }))
      .rejects.toThrow('Please select an option before accepting')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  it('rejects an optional_item_id that is not an optional item on the proposal', async () => {
    mockSnapshot(sentPackaged())
    await expect(signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true, selection: { package_id: 'good', optional_item_ids: ['not-real'] } }))
      .rejects.toThrow('Invalid selection')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('still signs a legacy itemized proposal with no selection (advances to closed_won)', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent', line_items: [] })
    const res = await signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true })
    expect(proposalUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }))
    expect(leadUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
    expect(res.payment_status).toBe('not_required')
  })

  // Guards against a hand-crafted public request sending a non-array
  // optional_item_ids, which would otherwise throw an uncaught TypeError
  // (500) from `for (const id of optionalIds)` instead of a clean rejection.
  it('rejects a non-array optional_item_ids without writing anything', async () => {
    mockSnapshot(sentPackaged())
    await expect(
      signProposal('tok', {
        signer_name: 'A', signer_email: 'a@a.co', consent: true,
        // @ts-expect-error deliberately malformed: a number instead of an array
        selection: { package_id: 'good', optional_item_ids: 42 },
      }),
    ).rejects.toThrow('Invalid request')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
    expect(leadUpdateSpy).not.toHaveBeenCalled()
  })

  // M-4 (carried over): cross-tenant isolation — the org/lead advanced on
  // sign must be resolved from the found doc's own path (doc.ref.parent.parent)
  // and its stored lead_id, never from any caller-supplied identifier.
  it('advances the lead via the org from the doc path and the doc lead_id (isolation)', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-from-doc', status: 'sent', line_items: [] })
    await signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true })
    expect(leadDocSpy).toHaveBeenCalledTimes(1)
    expect(leadDocSpy).toHaveBeenCalledWith('lead-from-doc')
    expect(leadUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }))
  })

  it('sends a best-effort confirmation email and does not fail the sign when it rejects', async () => {
    const { sendProposalSignedConfirmation } = await import('@/lib/email')
    vi.mocked(sendProposalSignedConfirmation).mockRejectedValueOnce(new Error('resend down'))
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent', line_items: [] })
    const res = await signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true })
    expect(res.payment_status).toBe('not_required')
    expect(proposalUpdateSpy).toHaveBeenCalledTimes(1)
    expect(sendProposalSignedConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@a.co', signerName: 'A', token: 'tok' }),
    )
  })

  // Fix 3: the confirmation email is sent from the org's verified sending
  // domain when one is configured — resolved the same way the registration
  // webhook resolves it, via getVerifiedSendingDomain(orgId), with the org id
  // coming from the doc path (never a caller-supplied value).
  it('resolves the org verified sending domain and passes it to the confirmation email', async () => {
    const { sendProposalSignedConfirmation } = await import('@/lib/email')
    const { getVerifiedSendingDomain } = await import('@/actions/domains')
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent', line_items: [] })
    await signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true })
    expect(getVerifiedSendingDomain).toHaveBeenCalledWith('org-1')
    expect(sendProposalSignedConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@a.co', signerName: 'A', token: 'tok', fromDomain: 'mail.acme.com' }),
    )
  })

  it('a verified-domain lookup failure does not block the confirmation email (best-effort fallback)', async () => {
    const { sendProposalSignedConfirmation } = await import('@/lib/email')
    const { getVerifiedSendingDomain } = await import('@/actions/domains')
    vi.mocked(getVerifiedSendingDomain).mockRejectedValueOnce(new Error('firestore down'))
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent', line_items: [] })
    const res = await signProposal('tok', { signer_name: 'A', signer_email: 'a@a.co', consent: true })
    expect(res.payment_status).toBe('not_required')
    expect(sendProposalSignedConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@a.co', signerName: 'A', fromDomain: undefined }),
    )
  })

  it('refuses to sign an expired proposal', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
      expires_at: '2020-01-01T00:00:00.000Z',
    })
    await expect(
      signProposal('tok', { signer_name: 'Dana', signer_email: 'd@x.com', consent: true }),
    ).rejects.toThrow(/expired/i)
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('allows signing when the expiry is in the future', async () => {
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
      expires_at: '2999-01-01T00:00:00.000Z',
    })
    await expect(
      signProposal('tok', { signer_name: 'Dana', signer_email: 'd@x.com', consent: true }),
    ).resolves.toBeDefined()
  })

  // Regression: the admin editor's expiry field is a bare <input
  // type="date">, so `expires_at` is stored as YYYY-MM-DD with no time
  // component. Naively parsing that as UTC midnight would reject signing for
  // the entire final valid day. A date-only expires_at of "today" must still
  // be signable — proposalExpiryInstant resolves it to end-of-day UTC.
  it('still allows signing when a date-only expiry is today', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mockSnapshot({
      id: 'p1', org_id: 'org-1', lead_id: 'l1', token: 'tok',
      status: 'sent', line_items: [], created_at: 'x',
      expires_at: today,
    })
    await expect(
      signProposal('tok', { signer_name: 'Dana', signer_email: 'd@x.com', consent: true }),
    ).resolves.toBeDefined()
  })
})

describe('respondToProposal decline', () => {
  it('appends a declined event', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    await respondToProposal('tok', 'rejected')
    const arg = proposalUpdateSpy.mock.calls[0][0]
    expect(arg.status).toBe('rejected')
    // events appended via FieldValue.arrayUnion — assert the update carried an events mutation
    expect('events' in arg).toBe(true)
  })
})

describe('recordProposalView', () => {
  it('appends a viewed event for a non-draft proposal', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    await recordProposalView('tok')
    expect(proposalUpdateSpy).toHaveBeenCalledTimes(1)
    const arg = proposalUpdateSpy.mock.calls[0][0]
    expect('events' in arg).toBe(true)
  })

  it('does nothing for a draft proposal', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'draft' })
    await recordProposalView('tok')
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('does nothing for an unknown token', async () => {
    mockSnapshot(null)
    await expect(recordProposalView('nope')).resolves.toBeUndefined()
    expect(proposalUpdateSpy).not.toHaveBeenCalled()
  })

  it('is best-effort: swallows a write failure instead of throwing', async () => {
    mockSnapshot({ id: 'p1', lead_id: 'lead-1', status: 'sent' })
    proposalUpdateSpy.mockRejectedValueOnce(new Error('firestore down'))
    await expect(recordProposalView('tok')).resolves.toBeUndefined()
  })
})
