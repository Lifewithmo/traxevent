'use server'

import { randomBytes } from 'crypto'
import { adminDb } from '@/lib/firebase-admin'

export function generateAccessToken(): string {
  return randomBytes(24).toString('hex')
}

export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

// Attaches a signed access token to a family record. Called after createRegistration.
export async function attachAccessToken(
  orgId: string,
  campId: string,
  familyId: string
): Promise<string> {
  const token = generateAccessToken()
  const expiresAt = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000 // 90 days
  ).toISOString()

  await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families').doc(familyId)
    .update({ access_token: token, access_token_expires_at: expiresAt })

  return token
}

// Validates a token against a family record. Returns the family id if valid, null if not.
export async function validateAccessToken(
  orgId: string,
  campId: string,
  token: string
): Promise<string | null> {
  const snap = await adminDb
    .collection('orgs').doc(orgId)
    .collection('camps').doc(campId)
    .collection('families')
    .where('access_token', '==', token)
    .limit(1)
    .get()

  if (snap.empty) return null

  const data = snap.docs[0].data()
  if (isTokenExpired(data.access_token_expires_at)) return null

  return snap.docs[0].id
}
