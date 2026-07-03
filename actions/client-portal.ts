'use server'

import { adminDb } from '@/lib/firebase-admin'
import { generateAccessToken } from '@/lib/tokens'
import { assertOrgAdmin } from '@/lib/auth/assert'
import type { Lead } from '@/lib/types'

// Ensure the lead has a client-portal token (generate on first use); returns it.
export async function ensureClientPortalToken(orgId: string, leadId: string): Promise<string> {
  await assertOrgAdmin(orgId)
  const ref = adminDb.collection('orgs').doc(orgId).collection('leads').doc(leadId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Lead not found')
  const lead = snap.data() as Lead
  if (lead.portal_token) return lead.portal_token
  const token = generateAccessToken()
  await ref.update({ portal_token: token, updated_at: new Date().toISOString() })
  return token
}
