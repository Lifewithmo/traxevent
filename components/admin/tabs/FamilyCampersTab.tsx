'use client'

import { useState } from 'react'
import type { FamilyMember } from '@/lib/types'
import { updateFamilyMembers } from '@/actions/admin-families'

interface FamilyCampersTabProps {
  members: FamilyMember[]
  familyId: string
  orgId: string
  campId: string
  onSaved: (members: FamilyMember[]) => void
}

function blankMember(familyId: string): FamilyMember {
  return {
    id: Math.random().toString(36).slice(2),
    family_id: familyId,
    first_name: '',
    last_name: '',
    birth_year: new Date().getFullYear() - 10,
    gender: '',
    grade: '',
    allergies: '',
    dietary_restrictions: '',
    tshirt_size: '',
    medical_notes: '',
  }
}

function MemberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-0.5">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-gray-50 focus:outline-none focus:ring-1 focus:ring-purple-300"
      />
    </div>
  )
}

export function FamilyCampersTab({
  members: initialMembers,
  familyId,
  orgId,
  campId,
  onSaved,
}: FamilyCampersTabProps) {
  const [members, setMembers] = useState<FamilyMember[]>(initialMembers)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  function updateMember(id: string, key: keyof FamilyMember, value: string) {
    setMembers(prev =>
      prev.map(m =>
        m.id === id
          ? { ...m, [key]: key === 'birth_year' ? parseInt(value, 10) || m.birth_year : value }
          : m
      )
    )
  }

  function addMember() {
    setMembers(prev => [...prev, blankMember(familyId)])
  }

  function removeMember(id: string) {
    setMembers(prev => prev.filter(m => m.id !== id))
    setConfirmRemove(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateFamilyMembers(orgId, campId, familyId, members)
      onSaved(members)
    } catch {
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {members.map(m => (
        <div key={m.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-semibold text-gray-700">
              {m.first_name || m.last_name ? `${m.first_name} ${m.last_name}`.trim() : 'New camper'}
            </span>
            {confirmRemove === m.id ? (
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  className="text-red-600 font-semibold"
                >
                  Remove
                </button>
                <button type="button" onClick={() => setConfirmRemove(null)} className="text-gray-400">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(m.id)}
                className="text-xs text-gray-400 hover:text-red-500"
                aria-label="Remove camper"
              >
                ✕
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MemberField label="First name" value={m.first_name} onChange={v => updateMember(m.id, 'first_name', v)} />
            <MemberField label="Last name" value={m.last_name} onChange={v => updateMember(m.id, 'last_name', v)} />
            <MemberField label="Birth year" value={m.birth_year} onChange={v => updateMember(m.id, 'birth_year', v)} />
            <MemberField label="Gender" value={m.gender} onChange={v => updateMember(m.id, 'gender', v)} />
            <MemberField label="Grade" value={m.grade} onChange={v => updateMember(m.id, 'grade', v)} />
            <MemberField label="T-shirt size" value={m.tshirt_size} onChange={v => updateMember(m.id, 'tshirt_size', v)} />
            <MemberField label="Allergies" value={m.allergies} onChange={v => updateMember(m.id, 'allergies', v)} />
            <MemberField label="Dietary restrictions" value={m.dietary_restrictions} onChange={v => updateMember(m.id, 'dietary_restrictions', v)} />
          </div>
          <div className="mt-2">
            <label className="block text-xs text-gray-400 mb-0.5">Medical notes</label>
            <textarea
              value={m.medical_notes}
              onChange={e => updateMember(m.id, 'medical_notes', e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-gray-50 resize-none focus:outline-none focus:ring-1 focus:ring-purple-300"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addMember}
        className="w-full py-2 border border-dashed border-purple-300 rounded-lg text-sm text-purple-600 hover:bg-purple-50 transition-colors"
      >
        + Add camper
      </button>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Save all'}
      </button>
    </div>
  )
}
