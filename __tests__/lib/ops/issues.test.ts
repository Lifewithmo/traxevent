import { describe, it, expect, vi, beforeEach } from 'vitest'

const docSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const docUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const listGetSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ docs: [] }))
const issuesColl = vi.hoisted(() => ({
  doc: vi.fn((id?: string) => ({ id: id ?? 'iss-new', set: docSetSpy, update: docUpdateSpy })),
  orderBy: vi.fn().mockReturnValue({ get: listGetSpy }),
}))
vi.mock('@/lib/firebase-admin', () => {
  const eventDoc = { collection: vi.fn(() => issuesColl) }
  const eventsColl = { doc: vi.fn(() => eventDoc) }
  const orgDoc = { collection: vi.fn(() => eventsColl) }
  return { adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => orgDoc) })) } }
})

import { createIssueCore, resolveIssueCore, listIssuesCore } from '@/lib/ops/issues'

beforeEach(() => vi.clearAllMocks())

describe('createIssueCore', () => {
  it('requires a note and a valid severity', async () => {
    await expect(createIssueCore('o1', 'e1', { type: 'equipment', severity: 'high', note: ' ', created_by: 'u1' }))
      .rejects.toThrow('Note is required')
    // @ts-expect-error invalid severity at runtime
    await expect(createIssueCore('o1', 'e1', { type: 'equipment', severity: 'urgent', note: 'x', created_by: 'u1' }))
      .rejects.toThrow('Invalid severity')
  })

  it('creates an open issue with id + created_at', async () => {
    const issue = await createIssueCore('o1', 'e1', { type: 'equipment', severity: 'high', note: 'Machine leaking', created_by: 'u1' })
    expect(issue.status).toBe('open')
    expect(issue.id).toBeTruthy()
    expect(docSetSpy).toHaveBeenCalled()
  })
})

describe('resolveIssueCore', () => {
  it('marks resolved with timestamp and optional resolution note', async () => {
    await resolveIssueCore('o1', 'e1', 'iss1', 'Tightened the fitting')
    const payload = docUpdateSpy.mock.calls[0][0]
    expect(payload.status).toBe('resolved')
    expect(payload.resolved_at).toBeTruthy()
    expect(payload.resolution).toBe('Tightened the fitting')
  })

  it('omits resolution when not given', async () => {
    await resolveIssueCore('o1', 'e1', 'iss1')
    expect('resolution' in docUpdateSpy.mock.calls[0][0]).toBe(false)
  })
})

describe('listIssuesCore', () => {
  it('orders by created_at descending', async () => {
    await listIssuesCore('o1', 'e1')
    expect(issuesColl.orderBy).toHaveBeenCalledWith('created_at', 'desc')
  })
})
