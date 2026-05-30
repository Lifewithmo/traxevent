'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { Family } from '@/lib/types'

type ContactData = Pick<Family,
  'first_name' | 'last_name' | 'email' | 'phone' | 'address' | 'emergency_contact'
>

interface ContactStepProps {
  initial: Partial<ContactData>
  onNext: (data: ContactData) => void
}

export function ContactStep({ initial, onNext }: ContactStepProps) {
  const [firstName, setFirstName] = useState(initial.first_name ?? '')
  const [lastName, setLastName] = useState(initial.last_name ?? '')
  const [email, setEmail] = useState(initial.email ?? '')
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [street, setStreet] = useState(initial.address?.street ?? '')
  const [city, setCity] = useState(initial.address?.city ?? '')
  const [state, setState] = useState(initial.address?.state ?? '')
  const [zip, setZip] = useState(initial.address?.zip ?? '')
  const [ecName, setEcName] = useState(initial.emergency_contact?.name ?? '')
  const [ecPhone, setEcPhone] = useState(initial.emergency_contact?.phone ?? '')
  const [ecRel, setEcRel] = useState(initial.emergency_contact?.relationship ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!firstName.trim()) e.first_name = 'Required'
    if (!lastName.trim()) e.last_name = 'Required'
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Valid email required'
    if (!phone.trim()) e.phone = 'Required'
    if (!ecName.trim()) e.ec_name = 'Required'
    if (!ecPhone.trim()) e.ec_phone = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleNext() {
    if (!validate()) return
    onNext({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      address: { street, city, state, zip },
      emergency_contact: { name: ecName, phone: ecPhone, relationship: ecRel },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#4C1D95] mb-4">Contact Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="first_name">First name</Label>
            <Input
              id="first_name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            {errors.first_name && <p className="text-xs text-red-600">{errors.first_name}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="last_name">Last name</Label>
            <Input
              id="last_name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
            {errors.last_name && <p className="text-xs text-red-600">{errors.last_name}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Address</h3>
        <div className="space-y-3">
          <Input placeholder="Street address" value={street} onChange={(e) => setStreet(e.target.value)} />
          <div className="grid grid-cols-3 gap-3">
            <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input placeholder="State" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} />
            <Input placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} maxLength={10} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Emergency Contact</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="ec_name">Name</Label>
            <Input
              id="ec_name"
              value={ecName}
              onChange={(e) => setEcName(e.target.value)}
            />
            {errors.ec_name && <p className="text-xs text-red-600">{errors.ec_name}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ec_phone">Phone</Label>
            <Input
              id="ec_phone"
              type="tel"
              value={ecPhone}
              onChange={(e) => setEcPhone(e.target.value)}
            />
            {errors.ec_phone && <p className="text-xs text-red-600">{errors.ec_phone}</p>}
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="ec_rel">Relationship</Label>
          <Input
            id="ec_rel"
            className="mt-1"
            placeholder="e.g. Spouse, Parent"
            value={ecRel}
            onChange={(e) => setEcRel(e.target.value)}
          />
        </div>
      </div>

      <Button className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]" onClick={handleNext}>
        Next: Family Members
      </Button>
    </div>
  )
}
