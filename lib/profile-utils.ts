import type { RegistrantProfile } from '@/lib/types'

export function buildEmptyProfile(
  uid: string,
  email: string,
  displayName: string
): RegistrantProfile {
  const now = new Date().toISOString()
  return {
    uid,
    display_name: displayName,
    email,
    phone: '',
    address: { street: '', city: '', state: '', zip: '' },
    emergency_contact: { name: '', phone: '', relationship: '' },
    saved_members: [],
    created_at: now,
    updated_at: now,
  }
}
