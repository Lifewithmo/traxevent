'use server'

import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import { logActivity } from '@/lib/activity'
import type { Note } from '@/lib/types'

function notesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('notes')
}

export interface CreateNoteInput {
  parent_type: 'customer' | 'opportunity'
  parent_id: string
  body: string
}

export async function createNote(orgId: string, input: CreateNoteInput): Promise<Note> {
  await assertOrgAdmin(orgId)
  if (!input.body?.trim()) throw new Error('Note body is required')
  const id = randomBytes(8).toString('hex')
  const note: Note = {
    id,
    parent_type: input.parent_type,
    parent_id: input.parent_id,
    body: input.body.trim(),
    created_at: new Date().toISOString(),
  }
  await notesRef(orgId).doc(id).set(note)
  await logActivity(orgId, {
    parent_type: note.parent_type,
    parent_id: note.parent_id,
    kind: 'note',
    summary: note.body.length > 80 ? note.body.slice(0, 80) + '…' : note.body,
  })
  return note
}

export async function listNotes(
  orgId: string,
  parentType: 'customer' | 'opportunity',
  parentId: string
): Promise<Note[]> {
  await assertOrgMember(orgId)
  const snap = await notesRef(orgId)
    .where('parent_type', '==', parentType)
    .where('parent_id', '==', parentId)
    .orderBy('created_at', 'desc')
    .get()
  return snap.docs.map((d) => d.data() as Note)
}

export async function deleteNote(orgId: string, noteId: string): Promise<void> {
  await assertOrgAdmin(orgId)
  await notesRef(orgId).doc(noteId).delete()
}
