import { describe, it, expect, vi, beforeEach } from 'vitest'

const noteDocSpy = vi.hoisted(() => ({
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const getNotesSpy = vi.hoisted(() => vi.fn())
const notesCollSpy = vi.hoisted(() => ({
  doc: vi.fn(() => noteDocSpy),
  where: vi.fn(),
}))
// where().where().orderBy().get() chain
notesCollSpy.where.mockImplementation(() => ({
  where: vi.fn(() => ({
    orderBy: vi.fn(() => ({ get: getNotesSpy })),
  })),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue(notesCollSpy),
      }),
    }),
  },
}))

vi.mock('@/lib/auth/assert', () => ({
  assertOrgMember: vi.fn().mockResolvedValue({}),
  assertOrgAdmin: vi.fn().mockResolvedValue({}),
}))

import { createNote, listNotes, deleteNote } from '@/actions/notes'

describe('createNote', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires a non-empty body', async () => {
    await expect(
      createNote('o1', { parent_type: 'customer', parent_id: 'c1', body: '  ' })
    ).rejects.toThrow('Note body is required')
  })

  it('creates a note with an id and timestamp', async () => {
    const note = await createNote('o1', { parent_type: 'opportunity', parent_id: 'l1', body: 'Called client' })
    expect(note.id).toBeTruthy()
    expect(note.created_at).toBeTruthy()
    expect(noteDocSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ parent_type: 'opportunity', parent_id: 'l1', body: 'Called client' })
    )
  })
})

describe('listNotes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns notes for a parent', async () => {
    getNotesSpy.mockResolvedValue({
      docs: [{ data: () => ({ id: 'n1', parent_type: 'customer', parent_id: 'c1', body: 'Hi', created_at: 'x' }) }],
    })
    const notes = await listNotes('o1', 'customer', 'c1')
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toBe('Hi')
  })
})

describe('deleteNote', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the note document', async () => {
    await deleteNote('o1', 'n1')
    expect(noteDocSpy.delete).toHaveBeenCalled()
  })
})
