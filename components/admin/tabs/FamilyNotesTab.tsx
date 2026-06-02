'use client'

import { useState } from 'react'
import type { Family, FamilyNote } from '@/lib/types'
import { addFamilyNote } from '@/actions/admin-families'

interface FamilyNotesTabProps {
  family: Family
  orgId: string
  campId: string
  onNoteAdded: (note: FamilyNote) => void
}

export function FamilyNotesTab({ family, orgId, campId, onNoteAdded }: FamilyNotesTabProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const notes = [...(family.notes ?? [])].reverse()

  async function handleAdd() {
    if (!text.trim()) return
    setSaving(true)
    const note = await addFamilyNote(orgId, campId, family.id, text.trim(), 'Admin')
    onNoteAdded(note)
    setText('')
    setSaving(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No notes yet</p>
      )}

      {notes.map(note => (
        <div
          key={note.id}
          className={`border-l-2 pl-3 rounded-r ${
            note.type === 'system'
              ? 'border-gray-200 bg-gray-50 py-2'
              : 'border-purple-300 bg-purple-50/40 py-2'
          }`}
        >
          <p className="text-xs text-gray-400 mb-0.5">
            {note.author} · {formatDate(note.created_at)}
          </p>
          <p className={`text-sm ${note.type === 'system' ? 'text-gray-400 italic' : 'text-gray-700'}`}>
            {note.text}
          </p>
        </div>
      ))}

      <div className="pt-2 border-t border-gray-100">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !text.trim()}
          className="mt-2 px-4 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-md hover:bg-purple-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Adding…' : 'Add note'}
        </button>
      </div>
    </div>
  )
}
