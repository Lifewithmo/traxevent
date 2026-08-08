'use server'

import { assertOrgAdmin } from '@/lib/auth/assert'
import { adminDb } from '@/lib/firebase-admin'
import { generateAccessToken } from '@/lib/tokens'
import type { Org } from '@/lib/types'

// Admin-side management of the org's public intake link. The public read/write
// path lives in actions/intake-public.ts.

export async function ensureIntakeToken(orgId: string): Promise<string> {
  await assertOrgAdmin(orgId)
  const ref = adminDb.collection('orgs').doc(orgId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Org not found')
  const org = snap.data() as Org
  if (org.intake_token) return org.intake_token
  const token = generateAccessToken()
  await ref.update({ intake_token: token })
  return token
}

export async function regenerateIntakeToken(orgId: string): Promise<string> {
  await assertOrgAdmin(orgId)
  const token = generateAccessToken()
  await adminDb.collection('orgs').doc(orgId).update({ intake_token: token })
  return token
}
