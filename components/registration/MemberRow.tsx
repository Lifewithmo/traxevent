'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { FamilyMember } from '@/lib/types'

type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

interface MemberRowProps {
  index: number
  member: MemberInput
  onChange: (index: number, updated: MemberInput) => void
  onRemove: (index: number) => void
}

export function MemberRow({ index, member, onChange, onRemove }: MemberRowProps) {
  function update(field: keyof MemberInput, value: string) {
    onChange(index, { ...member, [field]: value })
  }

  return (
    <div className="border rounded-lg p-4 bg-[#FAF5FF] space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-[#4C1D95]">Person {index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="text-gray-400 hover:text-red-600 h-auto py-1"
        >
          Remove
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`m-fn-${index}`}>First name</Label>
          <Input id={`m-fn-${index}`} value={member.first_name} onChange={(e) => update('first_name', e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-ln-${index}`}>Last name</Label>
          <Input id={`m-ln-${index}`} value={member.last_name} onChange={(e) => update('last_name', e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`m-by-${index}`}>Birth year</Label>
          <Input id={`m-by-${index}`} type="number" value={member.birth_year || ''} onChange={(e) => update('birth_year', e.target.value)} min={1920} max={2026} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-g-${index}`}>Gender</Label>
          <Input id={`m-g-${index}`} value={member.gender} onChange={(e) => update('gender', e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-gr-${index}`}>Grade</Label>
          <Input id={`m-gr-${index}`} value={member.grade} onChange={(e) => update('grade', e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`m-ts-${index}`}>T-shirt size</Label>
          <select
            id={`m-ts-${index}`}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            value={member.tshirt_size}
            onChange={(e) => update('tshirt_size', e.target.value)}
          >
            <option value="">-- Select --</option>
            {['YS','YM','YL','AS','AM','AL','AXL','A2XL'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-diet-${index}`}>Dietary restrictions</Label>
          <Input id={`m-diet-${index}`} value={member.dietary_restrictions} onChange={(e) => update('dietary_restrictions', e.target.value)} placeholder="None" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`m-allergy-${index}`}>Allergies</Label>
        <Input id={`m-allergy-${index}`} value={member.allergies} onChange={(e) => update('allergies', e.target.value)} placeholder="None" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`m-med-${index}`}>Medical notes</Label>
        <Input id={`m-med-${index}`} value={member.medical_notes} onChange={(e) => update('medical_notes', e.target.value)} placeholder="None" />
      </div>
    </div>
  )
}
