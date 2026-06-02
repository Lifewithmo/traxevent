'use client'

import { useState } from 'react'
import type { Family } from '@/lib/types'
import { updateAdminFamily } from '@/actions/admin-families'

interface FamilyDetailsTabProps {
  family: Family
  orgId: string
  campId: string
  onSaved: (updates: Partial<Family>) => void
}

type DraftFields = Pick<Family, 'first_name' | 'last_name' | 'email' | 'phone'> & {
  ec_name: string
  ec_phone: string
  ec_relationship: string
  addr_street: string
  addr_city: string
  addr_state: string
  addr_zip: string
}

function toDraft(f: Family): DraftFields {
  return {
    first_name: f.first_name,
    last_name: f.last_name,
    email: f.email,
    phone: f.phone,
    ec_name: f.emergency_contact.name,
    ec_phone: f.emergency_contact.phone,
    ec_relationship: f.emergency_contact.relationship,
    addr_street: f.address.street,
    addr_city: f.address.city,
    addr_state: f.address.state,
    addr_zip: f.address.zip,
  }
}

function isDirty(a: DraftFields, b: DraftFields) {
  return (Object.keys(a) as (keyof DraftFields)[]).some(k => a[k] !== b[k])
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"
      />
    </div>
  )
}

export function FamilyDetailsTab({ family, orgId, campId, onSaved }: FamilyDetailsTabProps) {
  const [clean, setClean] = useState<DraftFields>(() => toDraft(family))
  const [draft, setDraft] = useState<DraftFields>(() => toDraft(family))
  const [saving, setSaving] = useState(false)
  const dirty = isDirty(draft, clean)

  function set(key: keyof DraftFields) {
    return (v: string) => setDraft(prev => ({ ...prev, [key]: v }))
  }

  async function handleSave() {
    setSaving(true)
    const updates: Partial<Family> = {
      first_name: draft.first_name,
      last_name: draft.last_name,
      email: draft.email,
      phone: draft.phone,
      emergency_contact: {
        name: draft.ec_name,
        phone: draft.ec_phone,
        relationship: draft.ec_relationship,
      },
      address: {
        street: draft.addr_street,
        city: draft.addr_city,
        state: draft.addr_state,
        zip: draft.addr_zip,
      },
    }
    try {
      await updateAdminFamily(orgId, campId, family.id, updates)
      setClean(draft)
      onSaved(updates)
    } catch {
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={draft.first_name} onChange={set('first_name')} />
        <Field label="Last name" value={draft.last_name} onChange={set('last_name')} />
        <Field label="Email" value={draft.email} onChange={set('email')} />
        <Field label="Phone" value={draft.phone} onChange={set('phone')} />
      </div>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Emergency contact
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" value={draft.ec_name} onChange={set('ec_name')} />
          <Field label="Phone" value={draft.ec_phone} onChange={set('ec_phone')} />
          <div className="col-span-2">
            <Field label="Relationship" value={draft.ec_relationship} onChange={set('ec_relationship')} />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Address</p>
        <div className="space-y-2">
          <Field label="Street" value={draft.addr_street} onChange={set('addr_street')} />
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <Field label="City" value={draft.addr_city} onChange={set('addr_city')} />
            </div>
            <Field label="State" value={draft.addr_state} onChange={set('addr_state')} />
            <Field label="ZIP" value={draft.addr_zip} onChange={set('addr_zip')} />
          </div>
        </div>
      </div>

      {dirty && (
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  )
}
