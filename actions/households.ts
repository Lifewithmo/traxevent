'use server'

import { adminDb } from '@/lib/firebase-admin'
import { assertOrgMember } from '@/lib/auth/assert'
import { buildHouseholds, type Household, type HouseholdRow } from '@/lib/households'
import type { Camp, Family } from '@/lib/types'

export async function getOrgHouseholds(orgId: string): Promise<Household[]> {
  await assertOrgMember(orgId)

  const campsSnap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').orderBy('created_at', 'desc').get()
  const camps = campsSnap.docs.map((d) => d.data() as Camp)

  const rowsPerCamp = await Promise.all(
    camps.map(async (camp) => {
      const famSnap = await adminDb
        .collection('orgs').doc(orgId)
        .collection('camps').doc(camp.id)
        .collection('families').get()
      return famSnap.docs.map((d) => {
        const f = d.data() as Family
        const row: HouseholdRow = {
          email: f.email,
          first_name: f.first_name,
          last_name: f.last_name,
          phone: f.phone,
          registrant_uid: f.registrant_uid,
          created_at: f.created_at,
          camp_id: camp.id,
          camp_name: camp.name,
          year: camp.year,
          registration_status: f.registration_status,
          payment_status: f.payment_status,
        }
        return row
      })
    })
  )

  return buildHouseholds(rowsPerCamp.flat())
}
