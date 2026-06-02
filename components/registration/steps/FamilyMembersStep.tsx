'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MemberRow } from '@/components/registration/MemberRow'
import type { FamilyMember } from '@/lib/types'

type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

function emptyMember(): MemberInput {
  return {
    first_name: '', last_name: '', birth_year: 0, gender: '', grade: '',
    allergies: '', dietary_restrictions: '', tshirt_size: '', medical_notes: '',
  }
}

interface FamilyMembersStepProps {
  initial: MemberInput[]
  onNext: (members: MemberInput[]) => void
  onBack: () => void
  memberLabel?: string
}

export function FamilyMembersStep({ initial, onNext, onBack, memberLabel = 'Family Members' }: FamilyMembersStepProps) {
  const [members, setMembers] = useState<MemberInput[]>(
    initial.length > 0 ? initial : [emptyMember()]
  )

  function handleChange(index: number, updated: MemberInput) {
    setMembers((prev) => prev.map((m, i) => (i === index ? updated : m)))
  }

  function handleRemove(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index))
  }

  function handleAdd() {
    setMembers((prev) => [...prev, emptyMember()])
  }

  function handleNext() {
    const valid = members.filter((m) => m.first_name.trim() && m.last_name.trim())
    if (valid.length === 0) return
    onNext(valid)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[#4C1D95]">{memberLabel}</h2>
      <p className="text-sm text-gray-500">Add everyone who will be attending camp.</p>

      <div className="space-y-3">
        {members.map((member, i) => (
          <MemberRow
            key={i}
            index={i}
            member={member}
            onChange={handleChange}
            onRemove={handleRemove}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full border-[#7C3AED] text-[#7C3AED]"
        onClick={handleAdd}
      >
        + Add another person
      </Button>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9]"
          onClick={handleNext}
          disabled={members.every((m) => !m.first_name.trim())}
        >
          Next: Review
        </Button>
      </div>
    </div>
  )
}
