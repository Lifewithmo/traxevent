'use server'

import { adminAuth, adminDb } from '@/lib/firebase-admin'
import type { OrgRole } from '@/lib/types'

export async function setOrgClaims(
  uid: string,
  orgId: string,
  orgSlug: string,
  role: OrgRole
): Promise<void> {
  await adminAuth.setCustomUserClaims(uid, { orgId, orgSlug, role })
}

export async function setPlatformAdminClaim(uid: string): Promise<void> {
  await adminAuth.setCustomUserClaims(uid, { role: 'platform_admin' })
}

export async function createUser(
  uid: string,
  email: string,
  displayName: string
): Promise<void> {
  await adminDb.collection('users').doc(uid).set({
    email,
    display_name: displayName,
    created_at: new Date().toISOString(),
  })
}

export async function verifyIdToken(
  idToken: string
): Promise<{ uid: string; orgId?: string; orgSlug?: string; role?: string } | null> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    return {
      uid: decoded.uid,
      orgId: decoded.orgId as string | undefined,
      orgSlug: decoded.orgSlug as string | undefined,
      role: decoded.role as string | undefined,
    }
  } catch {
    return null
  }
}
