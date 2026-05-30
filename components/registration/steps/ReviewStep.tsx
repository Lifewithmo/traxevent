'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Family, FamilyMember } from '@/lib/types'

type ContactData = Pick<Family, 'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'emergency_contact'>
type MemberInput = Omit<FamilyMember, 'id' | 'family_id'>

interface ReviewStepProps {
  contact: ContactData
  members: MemberInput[]
  campName: string
  onSubmit: () => Promise<void>
  onBack: () => void
}

export function ReviewStep({ contact, members, campName, onSubmit, onBack }: ReviewStepProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      await onSubmit()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-[#4C1D95]">Review your registration</h2>

      <div className="bg-[#FAF5FF] rounded-lg p-4 space-y-1 text-sm">
        <p className="font-semibold text-gray-700">{campName}</p>
        <p className="text-gray-600">{contact.first_name} {contact.last_name}</p>
        <p className="text-gray-500">{contact.email} · {contact.phone}</p>
        {contact.address.city && (
          <p className="text-gray-500">{contact.address.city}, {contact.address.state} {contact.address.zip}</p>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-600 mb-2">
          {members.length} {members.length === 1 ? 'person' : 'people'} attending
        </p>
        <ul className="text-sm text-gray-600 space-y-1">
          {members.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#7C3AED] flex-shrink-0" />
              {m.first_name} {m.last_name}
              {m.birth_year ? ` (b. ${m.birth_year})` : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-[#ECEEF9] rounded-md p-3 text-xs text-gray-500">
        Payment is handled by the camp organizer. You will receive instructions after your registration is confirmed.
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button
          className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9]"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Submitting…' : 'Submit registration'}
        </Button>
      </div>
    </div>
  )
}
